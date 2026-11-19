import XCTest
@testable import SiennaCore

final class PinnedItemTests: XCTestCase {

    func testActions() {
        XCTAssertEqual(PinnedItem(title: "A", videoIds: ["dQw4w9WgXcQ"]).action, .songs(["dQw4w9WgXcQ"]))
        XCTAssertEqual(PinnedItem(title: "B", shortcut: "My Mix").action, .shortcut("My Mix"))
    }

    func testMalformedItemsHaveNoAction() {
        XCTAssertNil(PinnedItem(title: "none").action)
        XCTAssertNil(PinnedItem(title: "both", videoIds: ["abc"], shortcut: "x").action)
        XCTAssertNil(PinnedItem(title: "", shortcut: "x").action)
        XCTAssertNil(PinnedItem(title: "empty ids", videoIds: []).action)
        XCTAssertNil(PinnedItem(title: "blank shortcut", shortcut: "  ").action)
    }

    func testVideoIdValidationBlocksScriptInjection() {
        XCTAssertTrue(PinnedItem.isValidVideoId("dQw4w9WgXcQ"))
        XCTAssertTrue(PinnedItem.isValidVideoId("a-b_C1"))
        XCTAssertFalse(PinnedItem.isValidVideoId(""))
        XCTAssertFalse(PinnedItem.isValidVideoId("x\" & (do shell script \"id\") & \""))
        XCTAssertFalse(PinnedItem.isValidVideoId("é"))
        XCTAssertNil(PinnedItem(title: "evil", videoIds: ["a\"b"]).action)
    }

    func testDecodeDropsBadItemsAndCapsAtNine() throws {
        let good = (1...12).map { PinnedItem(title: "S\($0)", shortcut: "s\($0)") }
        var items = good
        items.insert(PinnedItem(title: "bad"), at: 0)
        let data = try PinnedStore.encode(items)
        let decoded = PinnedStore.decode(data)
        XCTAssertEqual(decoded.count, PinnedItem.maxCount)
        XCTAssertEqual(decoded.first?.title, "S1")
    }

    func testDecodeGarbageIsEmpty() {
        XCTAssertEqual(PinnedStore.decode(Data("not json".utf8)), [])
        XCTAssertEqual(PinnedStore.decode(Data()), [])
    }

    func testHandWrittenJSON() {
        let json = #"[{"title":"Focus","shortcut":"Sienna Focus"},{"title":"Anthem","videoIds":["dQw4w9WgXcQ"]}]"#
        let items = PinnedStore.decode(Data(json.utf8))
        XCTAssertEqual(items.map(\.title), ["Focus", "Anthem"])
    }

    func testMissingFileIsEmpty() {
        XCTAssertEqual(PinnedStore.load(from: URL(fileURLWithPath: "/nonexistent/pins.json")), [])
    }
}
