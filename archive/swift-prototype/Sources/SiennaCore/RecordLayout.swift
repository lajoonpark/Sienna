import Foundation

/// Pure geometry for the record's outer ring. No AppKit, so it is testable on any platform.
///
/// Angles are measured **clockwise from 12 o'clock**. Points are relative to the centre of
/// the record with **y pointing down** (screen coordinates).
public struct RecordLayout: Equatable, Sendable {

    public enum Hit: Equatable, Sendable {
        /// The label in the middle: play / pause.
        case label
        /// A sector of the ring, by index into the layout's targets.
        case sector(Int)
        /// Outside the record, or in the dead zone between label and ring.
        case none
    }

    public let sectorCount: Int
    /// Radius of the centre label.
    public let labelRadius: Double
    /// Where the ring starts; a small gap keeps the label and ring from ever overlapping.
    public let innerRadius: Double
    public let outerRadius: Double

    public init(sectorCount: Int = 0, labelRadius: Double = 70, outerRadius: Double = 200) {
        self.sectorCount = max(0, sectorCount)
        self.labelRadius = labelRadius
        self.innerRadius = labelRadius + max(2, outerRadius * 0.085)
        self.outerRadius = max(outerRadius, innerRadius + outerRadius * 0.2)
    }

    public var step: Double {
        sectorCount > 0 ? (2 * .pi) / Double(sectorCount) : 0
    }

    /// Angle of the centre line of sector `index`.
    public func centerAngle(of index: Int) -> Double {
        Double(index) * step
    }

    /// Clockwise-from-12 angle of a point, in `[0, 2π)`.
    public static func angle(x: Double, y: Double) -> Double {
        // atan2(x, -y): 0 at 12 o'clock, growing clockwise because y points down.
        var a = atan2(x, -y)
        if a < 0 { a += 2 * .pi }
        return a
    }

    public func hitTest(x: Double, y: Double) -> Hit {
        let r = (x * x + y * y).squareRoot()
        if r <= labelRadius { return .label }
        guard sectorCount > 0, r >= innerRadius, r <= outerRadius else { return .none }
        // Sector 0 is centred on 12 o'clock, so shift by half a step before bucketing.
        let shifted = (RecordLayout.angle(x: x, y: y) + step / 2).truncatingRemainder(dividingBy: 2 * .pi)
        let index = Int(shifted / step)
        return .sector(min(index, sectorCount - 1))
    }
}
