import Foundation

public struct NowPlaying: Equatable, Sendable {
    public var title: String
    public var artist: String
    public var artworkURL: URL?
    public var isPlaying: Bool
    /// 0...1 through the current track.
    public var progress: Double
    /// Seconds into the track, and its length (0 when unknown).
    public var position: Double
    public var duration: Double
    /// 0...1, or nil when the player did not say.
    public var volume: Double?
    public var isLiked: Bool

    public init(
        title: String,
        artist: String,
        artworkURL: URL? = nil,
        isPlaying: Bool = false,
        progress: Double = 0,
        position: Double = 0,
        duration: Double = 0,
        volume: Double? = nil,
        isLiked: Bool = false
    ) {
        self.title = title
        self.artist = artist
        self.artworkURL = artworkURL
        self.isPlaying = isPlaying
        self.progress = min(max(progress, 0), 1)
        self.position = max(position, 0)
        self.duration = max(duration, 0)
        self.volume = volume.map { min(max($0, 0), 1) }
        self.isLiked = isLiked
    }

    public static let idle = NowPlaying(title: "Nothing playing", artist: "")
}
