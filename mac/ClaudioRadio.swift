// ClaudioRadio.swift — Claudio App 主程序：原生窗口 + 服务生命周期管理
// 职责：启动 NCM/后端 → 等就绪 → 打开电台窗口；关窗退出时自动停台
// 编译: swiftc -O -swift-version 5 -import-objc-header AutoplayShim.h \
//       -module-cache-path /tmp/swift-modulecache \
//       AutoplayShim.m ClaudioRadio.swift -o ../MacOS/radio-window
import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var ncmProc: Process?
    var backendProc: Process?

    // MARK: - 路径

    // Bundle.main.bundlePath = ".../Claudio.app" → 上一层即项目根。
    // 用字符串删父目录：URL 版会因目录尾部斜杠把第一跳吃掉
    var projectRoot: URL {
        let bp = Bundle.main.bundlePath
        if bp.hasSuffix(".app") {
            return URL(fileURLWithPath: (bp as NSString).deletingLastPathComponent)
        }
        return URL(fileURLWithPath: "/Library/3.个人项目/Claudio")  // 直接跑二进制时的兜底
    }

    // MARK: - 生命周期

    func applicationDidFinishLaunching(_ note: Notification) {
        setupWindow()
        // 服务启动放后台线程，避免阻塞主线程（窗口先以黑底出现）
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            startServicesIfNeeded()
            DispatchQueue.main.async {
                let arg = CommandLine.arguments.dropFirst().first
                if let url = URL(string: arg ?? "http://localhost:8080") {
                    self.webView.load(URLRequest(url: url))
                }
            }
        }
    }

    // 关掉窗口 = 整个 App 退出（退出前 applicationWillTerminate 停台）
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // 已在运行时再次双击：把窗口带到前台
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window?.makeKeyAndOrderFront(nil) }
        return true
    }

    func applicationWillTerminate(_ note: Notification) { stopServices() }

    // MARK: - 窗口

    func setupWindow() {
        let conf = WKWebViewConfiguration()
        claudio_allow_autoplay(conf)   // 打开即续播（shim 内部 @try 兜底）
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        conf.defaultWebpagePreferences = prefs

        webView = WKWebView(frame: .zero, configuration: conf)
        webView.uiDelegate = self
        webView.underPageBackgroundColor = .black   // 深色 UI：加载时不闪白底

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1180, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = "Claudio"
        window.backgroundColor = .black
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
    }

    // 页面里 target=_blank 的链接交给系统默认浏览器
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    // MARK: - 服务管理

    // 启动过程日志（真实 open 环境下排查 spawn 失败用）
    func log(_ msg: String) {
        let path = "/tmp/claudio-logs/launcher.log"
        if !FileManager.default.fileExists(atPath: path) {
            FileManager.default.createFile(atPath: path, contents: nil)
        }
        let ts = DateFormatter()
        ts.dateFormat = "HH:mm:ss"
        let line = "[\(ts.string(from: Date()))] \(msg)\n"
        if let h = FileHandle(forWritingAtPath: path) {
            h.seekToEndOfFile()
            h.write(line.data(using: .utf8)!)
            try? h.close()
        }
    }

    func startServicesIfNeeded() {
        log("启动序列开始，bundle=\(Bundle.main.bundleURL.path)")
        log("projectRoot=\(projectRoot.path)")
        if syncHealth() {
            log("后端已在运行，跳过启动")
            return
        }
        log("后端未运行，开始拉起服务")

        let fm = FileManager.default
        let logDir = "/tmp/claudio-logs"
        try? fm.createDirectory(atPath: logDir, withIntermediateDirectories: true)
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

        // 1) NCM API（端口 3030）
        let ncm = Process()
        ncm.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        ncm.arguments = ["npx", "NeteaseCloudMusicApi"]
        let ncmDir = projectRoot.appendingPathComponent("claudio/ncm")
        log("ncm 目录存在: \(fm.fileExists(atPath: ncmDir.path)), cwd=\(ncmDir.path)")
        ncm.currentDirectoryURL = ncmDir
        ncm.environment = env.merging(["PORT": "3030"]) { _, new in new }
        redirect(ncm, log: "\(logDir)/ncm.log")
        do {
            try ncm.run()
            ncmProc = ncm
            log("ncm 已拉起 pid=\(ncm.processIdentifier)")
        } catch {
            log("ncm 拉起失败: \(error)")
        }
        Thread.sleep(forTimeInterval: 2)

        // 2) 后端（keepalive 守护，崩溃自动重启）
        let nodePath = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
            .first { fm.fileExists(atPath: $0) }
        log("node 路径: \(nodePath ?? "未找到!")")
        guard let node = nodePath else { return }
        let be = Process()
        be.executableURL = URL(fileURLWithPath: node)
        be.arguments = ["--env-file=.env", "services/keepalive.js"]
        let beDir = projectRoot.appendingPathComponent("claudio/backend")
        log("backend 目录存在: \(fm.fileExists(atPath: beDir.path)), cwd=\(beDir.path)")
        be.currentDirectoryURL = beDir
        be.environment = env
        redirect(be, log: "\(logDir)/backend.log")
        do {
            try be.run()
            backendProc = be
            log("backend 已拉起 pid=\(be.processIdentifier)")
        } catch {
            log("backend 拉起失败: \(error)")
        }

        // 3) 等后端就绪（最多 12 秒；超时也加载页面，WS 会自动重连）
        for i in 0..<12 {
            if syncHealth() {
                log("后端就绪，耗时 \(i + 1) 秒")
                return
            }
            Thread.sleep(forTimeInterval: 1)
        }
        log("12 秒后仍未就绪，放弃等待（页面会自动重连）")
    }

    func stopServices() {
        backendProc?.terminate()
        ncmProc?.terminate()
        pkill("keepalive.js")
        pkill("claudio/backend/server.js")
        pkill("NeteaseCloudMusicApi")
    }

    func pkill(_ pattern: String) {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/pkill")
        p.arguments = ["-f", pattern]
        try? p.run()
        p.waitUntilExit()
    }

    func redirect(_ p: Process, log: String) {
        if !FileManager.default.fileExists(atPath: log) {
            FileManager.default.createFile(atPath: log, contents: nil)
        }
        if let h = FileHandle(forWritingAtPath: log) {
            h.seekToEndOfFile()
            p.standardOutput = h
            p.standardError = h
        }
    }

    func syncHealth() -> Bool {
        guard let url = URL(string: "http://localhost:8080/api/health") else { return false }
        var req = URLRequest(url: url)
        req.timeoutInterval = 2
        let sem = DispatchSemaphore(value: 0)
        var ok = false
        URLSession.shared.dataTask(with: req) { data, _, _ in
            if let data = data, let s = String(data: data, encoding: .utf8),
               s.contains("\"ok\":true") { ok = true }
            sem.signal()
        }.resume()
        sem.wait()
        return ok
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
