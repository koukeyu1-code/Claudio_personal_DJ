// IconGen.swift — 生成红底白字 Claudio 应用图标（一次性工具）
// 编译运行后产出 1024 master，供 iconutil 打包 icns
import AppKit

let size: CGFloat = 1024
let img = NSImage(size: NSSize(width: size, height: size))
img.lockFocus()

// macOS 现代图标规范：内缩画圆角矩形
let margin: CGFloat = 100, radius: CGFloat = 185
let rect = NSRect(x: margin, y: margin, width: size - 2 * margin, height: size - 2 * margin)
let rrect = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
// 红色渐变（上亮下深，有质感）
let red = NSGradient(starting: NSColor(red: 0.93, green: 0.20, blue: 0.17, alpha: 1),
                     ending: NSColor(red: 0.76, green: 0.10, blue: 0.09, alpha: 1))
red?.draw(in: rrect, angle: -90)

// 白色粗体 "Claudio" 居中
let para = NSMutableParagraphStyle()
para.alignment = .center
let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 172, weight: .bold),
    .foregroundColor: NSColor.white,
    .paragraphStyle: para,
]
let text = NSAttributedString(string: "Claudio", attributes: attrs)
let tb = text.size()
text.draw(in: NSRect(x: margin, y: margin + (rect.height - tb.height) / 2,
                     width: rect.width, height: tb.height))
img.unlockFocus()

// 输出 master PNG
let master = "/tmp/claudio-icon-1024.png"
let tiff = img.tiffRepresentation!
let rep = NSBitmapImageRep(data: tiff)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: master))
print("master: \(master)")
