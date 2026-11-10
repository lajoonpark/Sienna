import Foundation

/// Logs a message as plain text. Never pass outside text (titles, error descriptions) as NSLog's
/// format string: a `%` in it would be read as a format directive.
public func siennaLog(_ message: String) {
    #if canImport(Darwin)
    NSLog("%@", message)
    #else
    FileHandle.standardError.write(Data((message + "\n").utf8))
    #endif
}
