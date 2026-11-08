import XCTest
@testable import SiennaCore

final class VolumeKnobTests: XCTestCase {

    func testAngleSweepsTwoSeventyDegreesAroundTop() {
        XCTAssertEqual(VolumeKnob.angle(for: 0), -0.75 * .pi, accuracy: 1e-9)
        XCTAssertEqual(VolumeKnob.angle(for: 0.5), 0, accuracy: 1e-9)
        XCTAssertEqual(VolumeKnob.angle(for: 1), 0.75 * .pi, accuracy: 1e-9)
    }

    func testScrollUpIsLouderWhateverTheScrollSetting() {
        // Wheel / "natural scrolling" off: up is positive.
        XCTAssertGreaterThan(VolumeKnob.volumeChange(scrollDeltaY: 3, precise: false, invertedFromDevice: false), 0)
        // Natural scrolling on: fingers moving up report negative deltas.
        XCTAssertGreaterThan(VolumeKnob.volumeChange(scrollDeltaY: -3, precise: true, invertedFromDevice: true), 0)
        XCTAssertLessThan(VolumeKnob.volumeChange(scrollDeltaY: 3, precise: true, invertedFromDevice: true), 0)
    }

    func testScrollSizes() {
        XCTAssertEqual(VolumeKnob.volumeChange(scrollDeltaY: 1, precise: false, invertedFromDevice: false), 0.05, accuracy: 1e-9)
        XCTAssertEqual(VolumeKnob.volumeChange(scrollDeltaY: 30, precise: true, invertedFromDevice: false), 0.1, accuracy: 1e-9)
    }

    func testAdjustClamps() {
        var knob = VolumeKnob(volume: 0.95)
        knob.adjust(by: 0.5)
        XCTAssertEqual(knob.volume, 1)
        knob.adjust(by: -5)
        XCTAssertEqual(knob.volume, 0)
        XCTAssertEqual(VolumeKnob(volume: 9).volume, 1)
    }

    func testDragFollowsThePointer() {
        var knob = VolumeKnob(volume: 0)
        knob.drag(toPointerAngle: 0)
        XCTAssertEqual(knob.volume, 0.5, accuracy: 1e-9)
        knob.drag(toPointerAngle: 0.75 * .pi)
        XCTAssertEqual(knob.volume, 1, accuracy: 1e-9)
        knob.drag(toPointerAngle: -0.75 * .pi)
        XCTAssertEqual(knob.volume, 0, accuracy: 1e-9)
        knob.drag(toPointerAngle: 0.25 * .pi)
        XCTAssertEqual(knob.volume, (0.25 * .pi + 0.75 * .pi) / (1.5 * .pi), accuracy: 1e-9)
    }

    func testDragAcrossTheGapDoesNotFlip() {
        var knob = VolumeKnob(volume: 0.9)
        knob.drag(toPointerAngle: .pi)        // straight down, in the gap
        XCTAssertEqual(knob.volume, 1)
        knob = VolumeKnob(volume: 0.1)
        knob.drag(toPointerAngle: .pi)
        XCTAssertEqual(knob.volume, 0)
    }

    func testDragNormalisesAngles() {
        var knob = VolumeKnob()
        knob.drag(toPointerAngle: 2 * .pi)    // a full turn is still 12 o'clock
        XCTAssertEqual(knob.volume, 0.5, accuracy: 1e-9)
        knob.drag(toPointerAngle: -2 * .pi + 0.25 * .pi)
        XCTAssertEqual(knob.volume, 0.5 + 0.25 * .pi / (1.5 * .pi), accuracy: 1e-9)
    }
}

final class RecordScrubTests: XCTestCase {

    func testClockwiseGoesForward() {
        var scrub = RecordScrub(grabAngle: 0, position: 60, duration: 200)
        scrub.update(angle: .pi / 2)          // a quarter turn
        XCTAssertEqual(scrub.position, 60 + RecordScrub.secondsPerTurn / 4, accuracy: 1e-9)
        scrub.update(angle: -.pi / 2)         // back past the start by a quarter turn
        XCTAssertEqual(scrub.position, 60 - RecordScrub.secondsPerTurn / 4, accuracy: 1e-9)
    }

    func testCrossingTwelveOClockTakesTheShortWay() {
        var scrub = RecordScrub(grabAngle: 2 * .pi - 0.1, position: 10, duration: 100)
        scrub.update(angle: 0.1)              // 359° -> ~6°: a small forward turn
        XCTAssertEqual(scrub.turned, 0.2, accuracy: 1e-9)
    }

    func testMultipleTurnsAccumulate() {
        var scrub = RecordScrub(grabAngle: 0, position: 0, duration: 1000)
        var angle = 0.0
        for _ in 0..<40 {                     // two full turns in small steps
            angle += .pi / 10
            scrub.update(angle: angle.truncatingRemainder(dividingBy: 2 * .pi))
        }
        XCTAssertEqual(scrub.position, 2 * RecordScrub.secondsPerTurn, accuracy: 1e-6)
    }

    func testClampedToTheSong() {
        var scrub = RecordScrub(grabAngle: 0, position: 5, duration: 30)
        scrub.update(angle: -.pi + 0.01)
        scrub.update(angle: -2 * .pi + 0.02)
        XCTAssertEqual(scrub.position, 0)
        XCTAssertEqual(scrub.progress, 0)

        var forward = RecordScrub(grabAngle: 0, position: 25, duration: 30)
        var a = 0.0
        for _ in 0..<20 { a += .pi / 2; forward.update(angle: a.truncatingRemainder(dividingBy: 2 * .pi)) }
        XCTAssertEqual(forward.position, 30)
        XCTAssertEqual(forward.progress, 1)
    }

    func testUnknownDurationIsSafe() {
        var scrub = RecordScrub(grabAngle: 0, position: 0, duration: 0)
        scrub.update(angle: 1)
        XCTAssertEqual(scrub.position, 0)
        XCTAssertEqual(scrub.progress, 0)
    }
}

final class LidHingeTests: XCTestCase {

    private func run(_ hinge: inout LidHinge, seconds: Double) {
        var t = 0.0
        while t < seconds { hinge.step(1.0 / 60); t += 1.0 / 60 }
    }

    func testReleaseFromShutEndsOpenAndAtRest() {
        var hinge = LidHinge()
        hinge.release()
        run(&hinge, seconds: 4)
        XCTAssertEqual(hinge.mode, .resting)
        XCTAssertEqual(hinge.angle, hinge.stop, accuracy: 1e-9)
        XCTAssertEqual(hinge.openness, 1, accuracy: 1e-9)
    }

    func testTheOpeningNeverStallsHalfWayOrLeavesItsTravel() {
        var hinge = LidHinge()
        hinge.release()
        var t = 0.0
        while hinge.isMoving && t < 5 {
            hinge.step(1.0 / 60)
            t += 1.0 / 60
            XCTAssertGreaterThanOrEqual(hinge.angle, 0)
            XCTAssertLessThanOrEqual(hinge.angle, hinge.stop)
        }
        XCTAssertLessThan(t, 3, "the lid should land well inside three seconds")
    }

    func testReleaseWorksAtAnyFrameRate() {
        for fps in [30.0, 60.0, 120.0] {
            var hinge = LidHinge()
            hinge.release()
            var t = 0.0
            while hinge.isMoving && t < 5 { hinge.step(1 / fps); t += 1 / fps }
            XCTAssertEqual(hinge.angle, hinge.stop, accuracy: 1e-9, "fps \(fps)")
        }
    }

    func testShutFromOpenLandsShutAndClacks() {
        var hinge = LidHinge()
        hinge.release()
        run(&hinge, seconds: 4)
        hinge.shut()
        var hardest = 0.0
        var t = 0.0
        while hinge.isMoving && t < 4 { hardest = max(hardest, hinge.step(1.0 / 60)); t += 1.0 / 60 }
        XCTAssertEqual(hinge.mode, .resting)
        XCTAssertEqual(hinge.angle, 0, accuracy: 1e-9)
        XCTAssertGreaterThan(hardest, 0, "the lid should land on the case with an impact")
    }

    func testReopeningAPartlyClosedLidEndsOpen() {
        for stopAfter in stride(from: 0.05, through: 0.4, by: 0.05) {
            var hinge = LidHinge()
            hinge.release()
            run(&hinge, seconds: 4)
            hinge.shut()
            run(&hinge, seconds: stopAfter)
            hinge.release()
            run(&hinge, seconds: 4)
            XCTAssertEqual(hinge.angle, hinge.stop, accuracy: 1e-9, "reopened after \(stopAfter)s")
        }
    }

    func testAStalledFrameCannotTunnelThroughTheStop() {
        var hinge = LidHinge()
        hinge.release()
        hinge.step(0.2)
        hinge.step(10)
        XCTAssertLessThanOrEqual(hinge.angle, hinge.stop)
        XCTAssertGreaterThanOrEqual(hinge.angle, 0)
    }
}

final class CoalescingSenderTests: XCTestCase {

    private actor Log {
        var values: [Int] = []
        func add(_ v: Int) { values.append(v) }
    }

    func testBurstEndsOnTheLatestValueAndSkipsTheMiddle() async {
        let log = Log()
        let sender = CoalescingSender<Int> { value in
            await log.add(value)
            try? await Task.sleep(nanoseconds: 30_000_000)
        }
        await withTaskGroup(of: Void.self) { group in
            for v in 1...20 { group.addTask { await sender.submit(v) } }
        }
        let values = await log.values
        XCTAssertFalse(values.isEmpty)
        XCTAssertLessThan(values.count, 20, "a burst should be coalesced")
    }

    func testSequentialValuesAllGoThrough() async {
        let log = Log()
        let sender = CoalescingSender<Int> { await log.add($0) }
        await sender.submit(1)
        await sender.submit(2)
        await sender.submit(3)
        let values = await log.values
        XCTAssertEqual(values, [1, 2, 3])
    }
}

final class SuitcaseControlTests: XCTestCase {
    func testNodeNamesAreUniqueAndCommandsMap() {
        XCTAssertEqual(Set(SuitcaseControl.allCases.map(\.rawValue)).count, SuitcaseControl.allCases.count)
        XCTAssertEqual(SuitcaseControl.playPause.command, .togglePlayPause)
        XCTAssertEqual(SuitcaseControl.like.command, .like)
        XCTAssertNil(SuitcaseControl.knob.command)
        XCTAssertTrue(SuitcaseControl.next.isButton)
        XCTAssertFalse(SuitcaseControl.record.isButton)
    }
}

final class SuitcaseLayoutTests: XCTestCase {

    func testTheStylusLandsOnTheGroovesItIsAskedFor() throws {
        for radius in [Tonearm.outerRadius, 0.8, Tonearm.innerRadius] {
            let s = try XCTUnwrap(Tonearm.stylus(atRadius: radius))
            XCTAssertEqual(s.distance(to: SuitcaseLayout.record), radius, accuracy: 1e-9)
            XCTAssertEqual(s.distance(to: Tonearm.pivot), Tonearm.length, accuracy: 1e-9)
        }
    }

    func testTheArmMovesInwardAsTheSongPlays() {
        var last = Tonearm.angle(forProgress: 0)
        for p in stride(from: 0.1, through: 1.0, by: 0.1) {
            let a = Tonearm.angle(forProgress: p)
            XCTAssertNotEqual(a, last)
            last = a
        }
        XCTAssertEqual(Tonearm.angle(forProgress: -3), Tonearm.angle(forProgress: 0))
        XCTAssertEqual(Tonearm.angle(forProgress: 9), Tonearm.angle(forProgress: 1))
    }

    func testTheStylusStaysOnTheRecordAndBehindTheButtons() throws {
        for p in stride(from: 0.0, through: 1.0, by: 0.25) {
            let r = Tonearm.outerRadius + (Tonearm.innerRadius - Tonearm.outerRadius) * p
            let s = try XCTUnwrap(Tonearm.stylus(atRadius: r))
            XCTAssertLessThan(s.z, SuitcaseLayout.record.z + 0.01, "stylus should be on the back half")
            XCTAssertGreaterThan(r, SuitcaseLayout.labelRadius, "stylus must stay outside the artwork")
            XCTAssertLessThan(r, SuitcaseLayout.recordRadius)
        }
    }

    func testTheArmAngleMatchesTheStylusDirection() throws {
        let radius = 0.8
        let s = try XCTUnwrap(Tonearm.stylus(atRadius: radius))
        let theta = try XCTUnwrap(Tonearm.angle(atRadius: radius))
        // Local -x rotated about y by theta: (-cos, sin) in (x, z).
        XCTAssertEqual(-cos(theta) * Tonearm.length, s.x - Tonearm.pivot.x, accuracy: 1e-9)
        XCTAssertEqual(sin(theta) * Tonearm.length, s.z - Tonearm.pivot.z, accuracy: 1e-9)
    }

    func testNothingOnTheDeckOverlapsOrFallsOffIt() {
        var circles: [(String, DeckPoint, Double)] = [
            ("record", SuitcaseLayout.record, SuitcaseLayout.platterRadius),
            ("knob", SuitcaseLayout.knob, SuitcaseLayout.knobRadius + 0.14), // with its tick marks
            ("pivot", Tonearm.pivot, 0.18),
        ]
        for c in SuitcaseControl.allCases {
            if let b = SuitcaseLayout.button(c) { circles.append((c.rawValue, b.center, b.radius)) }
        }
        for (name, p, r) in circles {
            XCTAssertLessThanOrEqual(abs(p.x) + r, SuitcaseLayout.deckHalfWidth, "\(name) off the deck")
            XCTAssertLessThanOrEqual(abs(p.z) + r, SuitcaseLayout.deckHalfDepth, "\(name) off the deck")
        }
        for i in circles.indices {
            for j in circles.indices where j > i {
                let gap = circles[i].1.distance(to: circles[j].1) - circles[i].2 - circles[j].2
                XCTAssertGreaterThan(gap, 0.02, "\(circles[i].0) overlaps \(circles[j].0)")
            }
        }
    }

    func testTheRecordBigEnoughForItsLabel() {
        XCTAssertLessThan(SuitcaseLayout.labelRadius, SuitcaseLayout.recordRadius)
        XCTAssertLessThan(SuitcaseLayout.recordRadius, SuitcaseLayout.platterRadius)
    }
}
