import Foundation

/// Kaset's `get player info` JSON. Every field is optional: Kaset can add or drop fields, and
/// the record should keep working with whatever is left.
struct KasetPlayerInfo: Decodable {
    struct Track: Decodable {
        var name: String?
        var artist: String?
        var album: String?
        var duration: Double?
        var videoId: String?
        var artworkURL: String?
    }

    var isPlaying: Bool?
    var isPaused: Bool?
    var position: Double?
    var duration: Double?
    /// 0...100.
    var volume: Double?
    /// "liked", and presumably "disliked" / "indifferent"; only "liked" is documented.
    var likeStatus: String?
    var currentTrack: Track?

    /// Maps to Sienna's model. Empty or unparseable text (Kaset closed, nothing queued)
    /// means idle.
    static func nowPlaying(fromJSON text: String) -> NowPlaying {
        guard let data = text.data(using: .utf8), !text.isEmpty,
              let info = try? JSONDecoder().decode(KasetPlayerInfo.self, from: data),
              let track = info.currentTrack,
              let name = track.name, !name.isEmpty
        else { return .idle }

        let total = info.duration ?? track.duration ?? 0
        let progress = total > 0 ? (info.position ?? 0) / total : 0
        return NowPlaying(
            title: name,
            artist: track.artist ?? "",
            artworkURL: track.artworkURL.flatMap(URL.init(string:)),
            isPlaying: info.isPlaying ?? !(info.isPaused ?? true),
            progress: progress,
            position: info.position ?? 0,
            duration: total,
            volume: info.volume.map { $0 / 100 },
            isLiked: info.likeStatus?.lowercased() == "liked"
        )
    }
}
