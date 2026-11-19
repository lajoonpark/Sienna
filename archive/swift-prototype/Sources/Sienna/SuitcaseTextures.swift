import AppKit
import CoreGraphics

/// Every image the suitcase uses is drawn here in code, so the app has no asset files.
enum SuitcaseTextures {

    // MARK: Plumbing

    /// A bitmap drawn with a plain CGContext (origin bottom left). Transparent to start with.
    static func bitmap(_ width: Int, _ height: Int, draw: (CGContext) -> Void) -> CGImage? {
        guard let ctx = CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        draw(ctx)
        return ctx.makeImage()
    }

    /// Deterministic, so a texture looks the same every launch.
    struct SeededGenerator: RandomNumberGenerator {
        var state: UInt64
        mutating func next() -> UInt64 {
            state &+= 0x9E37_79B9_7F4A_7C15
            var z = state
            z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
            z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
            return z ^ (z >> 31)
        }
    }

    private static func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor {
        CGColor(srgbRed: r, green: g, blue: b, alpha: a)
    }

    // MARK: Leather

    /// Tan leather with a fine grain. Tiles.
    static func leather() -> CGImage? {
        let size = 256
        return bitmap(size, size) { ctx in
            ctx.setFillColor(color(0.80, 0.52, 0.36))
            ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
            var rng = SeededGenerator(state: 7)
            for _ in 0..<5200 {
                let x = CGFloat.random(in: 0..<CGFloat(size), using: &rng)
                let y = CGFloat.random(in: 0..<CGFloat(size), using: &rng)
                let r = CGFloat.random(in: 0.8...2.2, using: &rng)
                let dark = Bool.random(using: &rng)
                let a = CGFloat.random(in: 0.05...0.16, using: &rng)
                ctx.setFillColor(dark ? color(0.30, 0.14, 0.07, a) : color(1, 0.85, 0.7, a))
                // Wrapped so the edges tile.
                for dx in [-size, 0, size] {
                    for dy in [-size, 0, size] {
                        ctx.fillEllipse(in: CGRect(x: x + CGFloat(dx) - r, y: y + CGFloat(dy) - r, width: r * 2, height: r * 2))
                    }
                }
            }
        }
    }

    /// Cream lining of the lid.
    static func lining() -> CGImage? {
        let size = 256
        return bitmap(size, size) { ctx in
            ctx.setFillColor(color(0.96, 0.93, 0.80))
            ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
            var rng = SeededGenerator(state: 11)
            for _ in 0..<2500 {
                let x = CGFloat.random(in: 0..<CGFloat(size), using: &rng)
                let y = CGFloat.random(in: 0..<CGFloat(size), using: &rng)
                ctx.setFillColor(color(0.6, 0.55, 0.4, CGFloat.random(in: 0.02...0.06, using: &rng)))
                ctx.fillEllipse(in: CGRect(x: x, y: y, width: 1.6, height: 1.6))
            }
        }
    }

    // MARK: Record

    /// Concentric grooves, drawn over the record's black disc. The image spans the record's
    /// diameter; the label area in the middle is left clear.
    static func grooves(labelFraction: CGFloat) -> CGImage? {
        let size = 1024
        return bitmap(size, size) { ctx in
            let c = CGFloat(size) / 2
            var rng = SeededGenerator(state: 21)
            var r = c * labelFraction + 14
            let limit = c * 0.975
            while r < limit {
                // A few wider, smoother bands between tracks.
                let gap = Int.random(in: 0..<60, using: &rng) == 0
                let alpha = gap ? CGFloat(0.02) : CGFloat.random(in: 0.025...0.09, using: &rng)
                ctx.setStrokeColor(color(1, 1, 1, alpha))
                ctx.setLineWidth(gap ? 3.5 : CGFloat.random(in: 0.5...1.1, using: &rng))
                ctx.strokeEllipse(in: CGRect(x: c - r, y: c - r, width: r * 2, height: r * 2))
                r += CGFloat.random(in: 1.6...3.2, using: &rng)
            }
            // Run-out ring near the label and a bright lip at the rim.
            ctx.setStrokeColor(color(1, 1, 1, 0.10))
            ctx.setLineWidth(2)
            let inner = c * labelFraction + 6
            ctx.strokeEllipse(in: CGRect(x: c - inner, y: c - inner, width: inner * 2, height: inner * 2))
            ctx.setStrokeColor(color(1, 1, 1, 0.14))
            ctx.setLineWidth(3)
            ctx.strokeEllipse(in: CGRect(x: c - limit - 4, y: c - limit - 4, width: (limit + 4) * 2, height: (limit + 4) * 2))
        }
    }

    /// The two bright wedges a real record shows under a light. Drawn additively on top.
    static func sheen(labelFraction: CGFloat) -> CGImage? {
        let size = 512
        return bitmap(size, size) { ctx in
            let c = CGFloat(size) / 2
            ctx.saveGState()
            ctx.addEllipse(in: CGRect(x: 0, y: 0, width: CGFloat(size), height: CGFloat(size)))
            let hole = c * labelFraction
            ctx.addEllipse(in: CGRect(x: c - hole, y: c - hole, width: hole * 2, height: hole * 2))
            ctx.clip(using: .evenOdd)
            let lobeCenter = CGFloat.pi * 0.28
            for degree in 0..<360 {
                let a = CGFloat(degree) * .pi / 180
                let lobe = pow(abs(cos(a - lobeCenter)), 18)
                guard lobe > 0.01 else { continue }
                ctx.setFillColor(color(1, 1, 1, 0.30 * lobe))
                ctx.move(to: CGPoint(x: c, y: c))
                ctx.addLine(to: CGPoint(x: c + c * cos(a), y: c + c * sin(a)))
                ctx.addLine(to: CGPoint(x: c + c * cos(a + .pi / 180), y: c + c * sin(a + .pi / 180)))
                ctx.closePath()
                ctx.fillPath()
            }
            ctx.restoreGState()
        }
    }

    /// The artwork as a round label: the image cropped square, then to a circle, with a thin
    /// dark edge and a spindle hole. With no artwork, a plain red label.
    static func label(artwork: NSImage?) -> CGImage? {
        let size = 512
        return bitmap(size, size) { ctx in
            let rect = CGRect(x: 0, y: 0, width: CGFloat(size), height: CGFloat(size))
            ctx.saveGState()
            ctx.addEllipse(in: rect)
            ctx.clip()
            if let artwork, let cg = artwork.cgImage(forProposedRect: nil, context: nil, hints: nil) {
                // Centre-crop to a square.
                let side = min(cg.width, cg.height)
                let crop = CGRect(x: (cg.width - side) / 2, y: (cg.height - side) / 2, width: side, height: side)
                if let square = cg.cropping(to: crop) {
                    ctx.interpolationQuality = .high
                    ctx.draw(square, in: rect)
                }
            } else {
                ctx.setFillColor(color(0.78, 0.18, 0.16))
                ctx.fill(rect)
                ctx.setStrokeColor(color(0.96, 0.88, 0.7, 0.8))
                ctx.setLineWidth(6)
                ctx.strokeEllipse(in: rect.insetBy(dx: 60, dy: 60))
            }
            ctx.restoreGState()
            ctx.setStrokeColor(color(0, 0, 0, 0.55))
            ctx.setLineWidth(5)
            ctx.strokeEllipse(in: rect.insetBy(dx: 2.5, dy: 2.5))
        }
    }

    // MARK: Buttons

    /// A tinted SF Symbol, centred on a transparent square.
    static func glyph(_ symbol: String, tint: NSColor) -> CGImage? {
        let size = 256
        guard let base = NSImage(systemSymbolName: symbol, accessibilityDescription: nil),
              let sized = base.withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 140, weight: .bold))
        else { return nil }
        return bitmap(size, size) { ctx in
            let target = CGFloat(size) * 0.58
            let s = sized.size
            let scale = min(target / s.width, target / s.height)
            let w = s.width * scale
            let h = s.height * scale
            let rect = NSRect(x: (CGFloat(size) - w) / 2, y: (CGFloat(size) - h) / 2, width: w, height: h)
            let gc = NSGraphicsContext(cgContext: ctx, flipped: false)
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = gc
            let tinted = NSImage(size: rect.size, flipped: false) { bounds in
                sized.draw(in: bounds)
                tint.set()
                bounds.fill(using: .sourceAtop)
                return true
            }
            tinted.draw(in: rect)
            NSGraphicsContext.restoreGraphicsState()
        }
    }

    // MARK: Speaker cloth

    static func grille() -> CGImage? {
        let size = 256
        return bitmap(size, size) { ctx in
            ctx.setFillColor(color(0.85, 0.77, 0.56))
            ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
            ctx.setLineWidth(1.2)
            var i = -size
            while i < size * 2 {
                ctx.setStrokeColor(color(0.45, 0.36, 0.18, 0.28))
                ctx.move(to: CGPoint(x: i, y: 0)); ctx.addLine(to: CGPoint(x: i + size, y: size)); ctx.strokePath()
                ctx.setStrokeColor(color(1, 0.96, 0.8, 0.30))
                ctx.move(to: CGPoint(x: i, y: size)); ctx.addLine(to: CGPoint(x: i + size, y: 0)); ctx.strokePath()
                i += 6
            }
        }
    }

    // MARK: Reflections

    /// A soft studio for the metal and the vinyl to reflect: a lit sky, a grey floor and a
    /// couple of bright panels. Equirectangular.
    static func studio() -> CGImage? {
        let w = 512, h = 256
        return bitmap(w, h) { ctx in
            let space = CGColorSpaceCreateDeviceRGB()
            let colors = [color(0.98, 0.98, 1.0), color(0.72, 0.72, 0.74), color(0.30, 0.27, 0.25)] as CFArray
            if let gradient = CGGradient(colorsSpace: space, colors: colors, locations: [0, 0.5, 1]) {
                ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: CGFloat(h)), end: .zero, options: [])
            }
            ctx.setFillColor(color(1, 1, 1, 0.95))
            ctx.fill(CGRect(x: 60, y: 120, width: 110, height: 90))
            ctx.fill(CGRect(x: 330, y: 150, width: 80, height: 60))
            ctx.setFillColor(color(1, 0.95, 0.85, 0.7))
            ctx.fill(CGRect(x: 200, y: 60, width: 60, height: 40))
        }
    }
}
