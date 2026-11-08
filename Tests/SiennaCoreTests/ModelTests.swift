import XCTest
@testable import SiennaCore

final class ModelTests: XCTestCase {

    func testDefaultHotkey() {
        XCTAssertTrue(HotkeySpec.default.isValid)
        XCTAssertEqual(HotkeySpec.default.displayName, "⌃⌥Space")
        XCTAssertFalse(HotkeySpec(keyCode: 14, shift: true).isValid)
    }

    func testProgressIsClamped() {
        XCTAssertEqual(NowPlaying(title: "t", artist: "a", progress: 3).progress, 1)
        XCTAssertEqual(NowPlaying(title: "t", artist: "a", progress: -1).progress, 0)
    }

    func testNullBackendIsIdle() async {
        let backend = NullBackend()
        let now = await backend.nowPlaying()
        XCTAssertEqual(now, .idle)
    }
}
