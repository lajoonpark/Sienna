import Foundation

/// Where cover art may come from, and how much of it Sienna will download.
///
/// Kaset reports a cover URL for the song that plays; that text comes from outside the app, so it
/// is only fetched when it points at one of Google's image hosts over HTTPS (no other port, no
/// user info), and a download is cut off past `maxBytes`.
public enum ArtworkURL {
    /// Image hosts YouTube Music serves covers from (and their subdomains).
    public static let allowedHostSuffixes = ["googleusercontent.com", "ggpht.com", "ytimg.com"]
    /// No cover is anywhere near this big; anything larger is refused.
    public static let maxBytes = 8 * 1024 * 1024
    /// A cover that has not arrived by then is given up on.
    public static let timeout: TimeInterval = 15

    /// `url` when it may be fetched, else nil.
    public static func allowed(_ url: URL?) -> URL? {
        guard let url, isAllowed(url) else { return nil }
        return url
    }

    public static func isAllowed(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https",
              url.user == nil, url.password == nil,
              url.port == nil || url.port == 443,
              let host = url.host?.lowercased(), !host.isEmpty
        else { return false }
        return allowedHostSuffixes.contains { host == $0 || host.hasSuffix("." + $0) }
    }
}
