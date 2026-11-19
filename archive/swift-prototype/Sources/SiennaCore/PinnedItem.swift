import Foundation

/// One thing pinned to the record's ring. Kaset can't list your library, so the ring is a short
/// list of favourites you choose, kept in a small JSON file.
///
/// Exactly one of `videoIds` / `shortcut` should be set:
///
/// ```json
/// [
///   { "title": "Focus",  "shortcut": "Sienna Focus" },
///   { "title": "Anthem", "videoIds": ["dQw4w9WgXcQ"] }
/// ]
/// ```
public struct PinnedItem: Codable, Equatable, Sendable {

    public enum Action: Equatable, Sendable {
        /// Play these YouTube Music video IDs, in order, through Kaset's AppleScript.
        case songs([String])
        /// Run a shortcut from the Shortcuts app (for example one built on Kaset's Play Playlist).
        case shortcut(String)
    }

    /// The ring has room for 1–9 because `1`–`9` pick a slice.
    public static let maxCount = 9

    public var title: String
    public var videoIds: [String]?
    public var shortcut: String?

    public init(title: String, videoIds: [String]? = nil, shortcut: String? = nil) {
        self.title = title
        self.videoIds = videoIds
        self.shortcut = shortcut
    }

    /// What picking this item does, or nil if the item is malformed (no action, both actions,
    /// an empty title, or a video ID that is not a plain YouTube ID).
    public var action: Action? {
        guard !title.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        switch (videoIds, shortcut) {
        case (let ids?, nil):
            guard !ids.isEmpty, ids.allSatisfy(PinnedItem.isValidVideoId) else { return nil }
            return .songs(ids)
        case (nil, let name?):
            guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
            return .shortcut(name)
        default:
            return nil
        }
    }

    /// YouTube IDs are letters, digits, `-` and `_`. Checking matters because IDs are spliced
    /// into AppleScript source.
    public static func isValidVideoId(_ id: String) -> Bool {
        !id.isEmpty && id.utf8.count <= 32 && id.unicodeScalars.allSatisfy {
            ($0.value < 128) && (CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_")
        }
    }
}

public enum PinnedStore {
    /// Parses pins from JSON, dropping malformed items and keeping the first `maxCount`.
    /// Returns an empty list for unreadable data rather than throwing: a typo in the file
    /// should leave the record working, not crash the app.
    public static func decode(_ data: Data) -> [PinnedItem] {
        guard let items = try? JSONDecoder().decode([PinnedItem].self, from: data) else { return [] }
        return Array(items.filter { $0.action != nil }.prefix(PinnedItem.maxCount))
    }

    public static func load(from url: URL) -> [PinnedItem] {
        guard let data = try? Data(contentsOf: url) else { return [] }
        return decode(data)
    }

    public static func encode(_ items: [PinnedItem]) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(items)
    }
}
