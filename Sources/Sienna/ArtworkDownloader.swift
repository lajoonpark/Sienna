import Foundation
import SiennaCore

/// Downloads cover art with the limits in `ArtworkURL`: only allowed hosts (redirects included),
/// a timeout, no cookies or cache, and a size cap. Returns nil for anything else.
enum ArtworkDownloader {
    /// Follows a redirect only to another allowed image host.
    private final class RedirectGuard: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask,
                        willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest) async -> URLRequest? {
            guard let next = request.url, ArtworkURL.isAllowed(next) else { return nil }
            return request
        }
    }

    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = ArtworkURL.timeout
        config.timeoutIntervalForResource = ArtworkURL.timeout
        config.httpCookieStorage = nil
        config.urlCache = nil
        return URLSession(configuration: config, delegate: RedirectGuard(), delegateQueue: nil)
    }()

    static func fetch(_ url: URL) async -> Data? {
        guard ArtworkURL.isAllowed(url) else { return nil }
        do {
            let (bytes, response) = try await session.bytes(from: url)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  response.expectedContentLength <= Int64(ArtworkURL.maxBytes)
            else { return nil }
            var data = Data()
            for try await byte in bytes {
                data.append(byte)
                if data.count > ArtworkURL.maxBytes { return nil }
            }
            return data
        } catch {
            return nil
        }
    }
}
