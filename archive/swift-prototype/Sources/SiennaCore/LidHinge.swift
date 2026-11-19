import Foundation

/// The lid's hinge, as a physical thing rather than an easing curve.
///
/// Ported from Lodestar's compass (Safari-Bookmarks-Radial, `RadialCore/LidHinge.swift`) so the
/// suitcase opens with the same weighty flick, swing over the top and landing on the stop.
///
/// A real lid is flicked, goes over the top and falls onto its stop. Gravity pulls it shut until
/// it passes vertical and open after that, so the swing slows near the top and then drops; the
/// stop is hard and gives a little bounce, and a lid that is pushed shut meets the case with a
/// small clack. A spring cannot do any of that: it has no top to slow at and no stop to land on,
/// and it either overshoots through the stop or creeps up to it. This is what makes the opening
/// read as one weighty gesture instead of a plate that fades into a pose.
///
/// Angles are radians, 0 = shut, `stop` = fully open. The model is deterministic and has no
/// view in it, so the properties that matter (it always ends open, it never stalls half way,
/// it never leaves its travel) are unit tested on any platform.
public struct LidHinge: Equatable, Sendable {

    public enum Mode: Equatable, Sendable {
        /// Nothing is moving. Entered by landing on a stop, never by running out of speed
        /// part way, so the lid is always either shut or open when it is at rest.
        case resting
        /// Released: flicked open, then on its own under gravity.
        case opening
        /// Pushed shut by a stiff spring, which is how a hand closes a lid.
        case closing
    }

    /// The tuning. Chosen against the design harness, where the opening can be watched frame by
    /// frame; the numbers say what they do.
    enum Tuning {
        /// Pull of gravity on the lid, as an angular acceleration at the horizontal. It closes the
        /// lid below vertical and opens it above vertical.
        static let gravity = 46.0
        /// Drag at the hinge, per second.
        static let friction = 2.5
        /// How much of its speed the lid keeps when it lands on the open stop.
        static let stopBounce = 0.38
        /// The most speed that rebound may have. Without this a hard launch from a nearly shut
        /// lid bounces back below vertical, where gravity closes it again, so the lid ends up
        /// shut after being asked to open.
        static let maxBounce = 3.0
        /// The same for the shut stop. Small: a closing lid should land, not rattle.
        static let shutBounce = 0.16
        /// Below this a landing is a settle, not a bounce, and the lid stops dead.
        static let restSpeed = 0.9
        /// Launch speed from fully shut: the latch letting go.
        static let pop = 1.5
        /// The latch's push stays on until the lid has opened this far (about 14°).
        static let driveTo = 0.25
        static let drive = 400.0
        /// Closing is a stiff, well damped spring aimed a little past shut, so the lid arrives
        /// at the case with speed and stops on it.
        static let closeStiffness = 520.0
        static let closeDamping = 40.0
        static let closeTarget = -0.07
    }

    /// Fully open, in radians: a suitcase lid rests leaning a little past vertical.
    public static let defaultStop: Double = 112 * .pi / 180

    public let stop: Double
    public private(set) var angle: Double
    public private(set) var velocity: Double
    public private(set) var mode: Mode
    /// The speed of the hardest landing in the last `step`, or 0. The view turns it into a tap
    /// on the case, so the stop is felt as well as seen.
    public private(set) var impact: Double

    public init(stop: Double = LidHinge.defaultStop) {
        self.stop = max(0.1, stop)
        self.angle = 0
        self.velocity = 0
        self.mode = .resting
        self.impact = 0
    }

    /// 0 = shut, 1 = fully open.
    public var openness: Double { angle / stop }

    public var isMoving: Bool { mode != .resting }

    /// Flicks the lid open, from wherever it is.
    ///
    /// From shut it gets the latch's pop, and the latch's push carries it on from there. From
    /// part way (a summon that reverses a close) it is launched with enough speed to clear
    /// vertical, because a lid that is pushed open and stalls at 80° falls back shut, and the
    /// suitcase would flicker open and then close on its own.
    public mutating func release() {
        mode = .opening
        let launch: Double
        if angle < 0.05 {
            launch = Tuning.pop
        } else {
            let climb = max(0, 2 * Tuning.gravity * (1 - sin(angle)))
            launch = climb.squareRoot() * 1.2 + 2.5
        }
        velocity = max(velocity, launch)
    }

    /// Pushes the lid shut.
    public mutating func shut() {
        mode = .closing
    }

    /// Puts the lid shut and still, with nothing in flight.
    public mutating func snapShut() {
        angle = 0
        velocity = 0
        mode = .resting
        impact = 0
    }

    /// Advances by `dt` seconds and returns the hardest landing during it (0 if none).
    ///
    /// Sub-stepped at 240Hz like the springs, so a stalled frame cannot make the lid tunnel
    /// through its stop.
    @discardableResult
    public mutating func step(_ dt: Double) -> Double {
        impact = 0
        guard mode != .resting else { return 0 }
        let clamped = min(max(dt, 0), 0.25)
        let steps = max(1, Int((clamped * 240).rounded(.up)))
        let h = clamped / Double(steps)
        for _ in 0..<steps {
            let acceleration: Double
            if mode == .closing {
                acceleration = -Tuning.closeStiffness * (angle - Tuning.closeTarget)
                    - Tuning.closeDamping * velocity
            } else {
                var a = -Tuning.gravity * cos(angle) - Tuning.friction * velocity
                if angle < Tuning.driveTo { a += Tuning.drive }
                acceleration = a
            }
            velocity += acceleration * h
            angle += velocity * h
            if angle >= stop {
                angle = stop
                if velocity > Tuning.restSpeed {
                    impact = max(impact, velocity)
                    velocity = -min(Tuning.stopBounce * velocity, Tuning.maxBounce)
                } else {
                    velocity = 0
                }
            } else if angle <= 0 {
                angle = 0
                if velocity < -Tuning.restSpeed {
                    impact = max(impact, -velocity)
                    velocity = -Tuning.shutBounce * velocity
                } else {
                    velocity = 0
                }
            }
        }
        let landed = (mode == .opening && angle == stop) || (mode == .closing && angle == 0)
        if landed && velocity == 0 {
            mode = .resting
        }
        return impact
    }
}
