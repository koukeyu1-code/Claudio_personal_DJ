// AutoplayShim.m — 允许 WKWebView 无手势自动播放（电台打开即续播）
// WebKit 内部偏好在不同版本里键名可能变化：@try 兜底，失败则退化为手动点一次播放
#import "AutoplayShim.h"

void claudio_allow_autoplay(WKWebViewConfiguration *conf) {
    @try {
        [conf.preferences setValue:@NO forKey:@"mediaPlaybackRequiresUserGesture"];
    } @catch (NSException *e) {}
    @try {
        [conf setValue:@NO forKey:@"mediaTypesRequiringUserAction"];
    } @catch (NSException *e) {}
}
