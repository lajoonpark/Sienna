import XCTest
@testable import SiennaCore

private final class FakeRunner: ScriptRunner, @unchecked Sendable {
    var scripts: [String] = []
    var shortcuts: [String] = []
    var reply = ""
    var fail = false

    func osascript(_ source: String) async throws -> String {
        scripts.append(source)
        if fail { throw ScriptError(status: 1, message: "boom") }
        return reply
    }
    func runShortcut(_ name: String) async throws {
        shortcuts.append(name)
        if fail { throw ScriptError(status: 1, message: "boom") }
    }
}

final class KasetTests: XCTestCase {

    func testCommandScripts() {
        XCTAssertEqual(KasetScripts.script(for: .togglePlayPause), #"tell application "Kaset" to playpause"#)
        XCTAssertEqual(KasetScripts.script(for: .next), #"tell application "Kaset" to next track"#)
        XCTAssertEqual(KasetScripts.script(for: .previous), #"tell application "Kaset" to previous track"#)
        XCTAssertEqual(KasetScripts.script(for: .like), #"tell application "Kaset" to like track"#)
    }

    func testVolumeAndSeekScripts() {
        XCTAssertEqual(KasetScripts.script(for: .setVolume(0.5)), #"tell application "Kaset" to set volume 50"#)
        XCTAssertEqual(KasetScripts.script(for: .setVolume(0.333)), #"tell application "Kaset" to set volume 33"#)
        XCTAssertEqual(KasetScripts.script(for: .setVolume(7)), #"tell application "Kaset" to set volume 100"#)
        XCTAssertEqual(KasetScripts.script(for: .setVolume(-1)), #"tell application "Kaset" to set volume 0"#)
        XCTAssertEqual(KasetScripts.script(for: .setVolume(.nan)), #"tell application "Kaset" to set volume 0"#)
        XCTAssertNil(KasetScripts.script(for: .seek(to: 30)), "Kaset has no seek command")
    }

    func testSeekIsNotSentToKaset() async {
        let runner = FakeRunner()
        let backend = KasetBackend(runner: runner)
        XCTAssertFalse(backend.canSeek)
        await backend.send(.seek(to: 30))
        XCTAssertTrue(runner.scripts.isEmpty)
        await backend.send(.setVolume(0.2))
        XCTAssertEqual(runner.scripts, [#"tell application "Kaset" to set volume 20"#])
    }

    func testVolumeAndLikeParsing() {
        let json = #"""
        {"isPlaying":true,"position":10,"duration":100,"volume":75,"likeStatus":"liked",
         "currentTrack":{"name":"S","artist":"A"}}
        """#
        let now = KasetPlayerInfo.nowPlaying(fromJSON: json)
        XCTAssertEqual(now.volume ?? -1, 0.75, accuracy: 1e-9)
        XCTAssertTrue(now.isLiked)
        XCTAssertEqual(now.position, 10)
        XCTAssertEqual(now.duration, 100)

        let plain = KasetPlayerInfo.nowPlaying(fromJSON: #"{"currentTrack":{"name":"S"}}"#)
        XCTAssertNil(plain.volume)
        XCTAssertFalse(plain.isLiked)
    }

    func testPlayScripts() {
        XCTAssertEqual(KasetScripts.play(videoIds: ["abc"]), #"tell application "Kaset" to play video "abc""#)
        XCTAssertEqual(
            KasetScripts.play(videoIds: ["a", "b"]),
            #"tell application "Kaset" to play videos {"a", "b"} starting at 1"#
        )
        XCTAssertNil(KasetScripts.play(videoIds: []))
        XCTAssertNil(KasetScripts.play(videoIds: ["a\" & x"]))
    }

    func testPlayerInfoParsing() {
        let json = """
        {"isPlaying":true,"isPaused":false,"position":30,"duration":120,"volume":50,
         "currentTrack":{"name":"Song","artist":"Band","album":"LP","duration":120,
                         "videoId":"abc","artworkURL":"https://lh3.googleusercontent.com/a.jpg"}}
        """
        let now = KasetPlayerInfo.nowPlaying(fromJSON: json)
        XCTAssertEqual(now.title, "Song")
        XCTAssertEqual(now.artist, "Band")
        XCTAssertEqual(now.artworkURL, URL(string: "https://lh3.googleusercontent.com/a.jpg"))
        XCTAssertTrue(now.isPlaying)
        XCTAssertEqual(now.progress, 0.25, accuracy: 1e-9)
    }

    func testArtworkFromOtherHostsIsDropped() {
        for art in ["https://example.com/a.jpg", "http://lh3.googleusercontent.com/a.jpg",
                    "https://audit.invalid?x=.ytimg.com/a", "https://user@i.ytimg.com/a.jpg",
                    "https://i.ytimg.com:8443/a.jpg", "https://evilytimg.com/a.jpg", "file:///etc/passwd"] {
            let json = #"{"currentTrack":{"name":"S","artworkURL":"\#(art)"}}"#
            XCTAssertNil(KasetPlayerInfo.nowPlaying(fromJSON: json).artworkURL, art)
        }
        XCTAssertTrue(ArtworkURL.isAllowed(URL(string: "https://i.ytimg.com/vi/x/hq.jpg")!))
        XCTAssertTrue(ArtworkURL.isAllowed(URL(string: "https://yt3.ggpht.com/a=s88")!))
    }

    func testPausedAndMissingFields() {
        let json = #"{"isPaused":true,"currentTrack":{"name":"Only a name"}}"#
        let now = KasetPlayerInfo.nowPlaying(fromJSON: json)
        XCTAssertEqual(now.title, "Only a name")
        XCTAssertFalse(now.isPlaying)
        XCTAssertEqual(now.progress, 0)
    }

    func testIdleCases() {
        XCTAssertEqual(KasetPlayerInfo.nowPlaying(fromJSON: ""), .idle)
        XCTAssertEqual(KasetPlayerInfo.nowPlaying(fromJSON: "garbage"), .idle)
        XCTAssertEqual(KasetPlayerInfo.nowPlaying(fromJSON: #"{"isPlaying":false}"#), .idle)
        XCTAssertEqual(KasetPlayerInfo.nowPlaying(fromJSON: #"{"currentTrack":{"name":""}}"#), .idle)
    }

    func testBackendSendsAndOpens() async {
        let runner = FakeRunner()
        let backend = KasetBackend(runner: runner)
        await backend.send(.next)
        await backend.open(PinnedItem(title: "S", videoIds: ["abc"]))
        await backend.open(PinnedItem(title: "Mix", shortcut: "Sienna Mix"))
        await backend.open(PinnedItem(title: "bad"))
        XCTAssertEqual(runner.scripts, [
            #"tell application "Kaset" to next track"#,
            #"tell application "Kaset" to play video "abc""#,
        ])
        XCTAssertEqual(runner.shortcuts, ["Sienna Mix"])
    }

    func testNowPlayingThroughBackend() async {
        let runner = FakeRunner()
        runner.reply = #"{"isPlaying":true,"position":1,"duration":4,"currentTrack":{"name":"X","artist":"Y"}}"#
        let now = await KasetBackend(runner: runner).nowPlaying()
        XCTAssertEqual(now.title, "X")
        XCTAssertEqual(now.progress, 0.25, accuracy: 1e-9)
        XCTAssertEqual(runner.scripts, [KasetScripts.playerInfo])
    }

    func testBackendSwallowsFailures() async {
        let runner = FakeRunner()
        runner.fail = true
        let backend = KasetBackend(runner: runner)
        await backend.send(.like)
        await backend.open(PinnedItem(title: "Mix", shortcut: "m"))
        let now = await backend.nowPlaying()
        XCTAssertEqual(now, .idle)
    }
}
