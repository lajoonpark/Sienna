import XCTest
@testable import SiennaCore

final class RecordLayoutTests: XCTestCase {

    private let layout = RecordLayout(sectorCount: 5, labelRadius: 70, outerRadius: 200)

    func testCentreIsLabel() {
        XCTAssertEqual(layout.hitTest(x: 0, y: 0), .label)
        XCTAssertEqual(layout.hitTest(x: 40, y: -30), .label)
    }

    func testDeadZoneAndOutsideAreNone() {
        // Between label (70) and ring start (~87).
        XCTAssertEqual(layout.hitTest(x: 0, y: -78), .none)
        XCTAssertEqual(layout.hitTest(x: 0, y: -400), .none)
    }

    func testFirstSectorIsTwelveOClock() {
        XCTAssertEqual(layout.hitTest(x: 0, y: -150), .sector(0))
    }

    func testSectorsRunClockwise() {
        // Five sectors, 72° each. Sector 1 is centred at 72° (right of and above centre).
        let a = layout.centerAngle(of: 1)
        let x = 150 * sin(a), y = -150 * cos(a)
        XCTAssertEqual(layout.hitTest(x: x, y: y), .sector(1))
        // Straight down is 180°, which falls in sector 2 (centred 144°, spans 108°-180°) or 3 (180°-252°).
        XCTAssertEqual(layout.hitTest(x: 1, y: 150), .sector(2))
        // Just left of 12 o'clock wraps to the last sector.
        XCTAssertEqual(layout.hitTest(x: -10, y: -150), .sector(0))
        XCTAssertEqual(layout.hitTest(x: -100, y: -100), .sector(4))
    }

    func testEverySectorCentreHitsItself() {
        for i in 0..<layout.sectorCount {
            let a = layout.centerAngle(of: i)
            XCTAssertEqual(layout.hitTest(x: 150 * sin(a), y: -150 * cos(a)), .sector(i))
        }
    }

    func testAngleIsClockwiseFromTwelve() {
        XCTAssertEqual(RecordLayout.angle(x: 0, y: -1), 0, accuracy: 1e-9)
        XCTAssertEqual(RecordLayout.angle(x: 1, y: 0), .pi / 2, accuracy: 1e-9)
        XCTAssertEqual(RecordLayout.angle(x: 0, y: 1), .pi, accuracy: 1e-9)
        XCTAssertEqual(RecordLayout.angle(x: -1, y: 0), 3 * .pi / 2, accuracy: 1e-9)
    }

    func testEmptyLayoutNeverHitsSector() {
        let empty = RecordLayout(sectorCount: 0)
        XCTAssertEqual(empty.hitTest(x: 0, y: -150), .none)
    }
}
