# Refactor Objective-C Message Send Patterns

## Overview
This task focuses on reducing code repetition and improving maintainability in the Objective-C message send patterns used throughout the Gemra terminal emulator codebase.

## Problem Statement
The `renderer.zig` file contains excessive repetition of `objc.msgSend` calls with similar patterns, particularly in the `Renderer.init()` function. This creates verbose, hard-to-read code that is error-prone and difficult to maintain.

## Current Issues
1. **Verbosity**: Each vertex attribute configuration requires 4 separate `objc.msgSend` calls
2. **Error-prone**: Manual index management and offsets are scattered throughout
3. **Hard to maintain**: Adding new attributes or changing configurations requires modifying multiple places
4. **Inconsistent patterns**: Similar operations use different approaches across the codebase

## Proposed Solution
Create helper functions to reduce repetition while maintaining the same functionality:

### 1. Vertex Attribute Setup Helper
```zig
fn setupVertexAttribute(desc: objc.id, index: u64, format: u64, offset: usize, bufferIndex: u64) void
```
- Configures all vertex attributes in a loop
- Reduces 4 separate calls to 1 function call per attribute
- Centralizes attribute configuration logic

### 2. Pipeline Property Setter Helper
```zig
fn setPipelineProperty(desc: objc.id, property: [*:0]const u8, value: anytype) void
```
- Standardizes pipeline configuration
- Reduces repetitive `objc.msgSendVoid` calls
- Provides type safety for common pipeline properties

### 3. Error Handling Wrapper
```zig
fn createObjCObject(comptime name: [*:0]const u8, allocator: std.mem.Allocator) !objc.id
```
- Centralizes Objective-C object creation
- Provides consistent error handling
- Reduces boilerplate for object initialization

## Implementation Requirements

### 1. Helper Functions (in objc.zig)
- Add vertex attribute setup helper
- Add pipeline property setter helper
- Add error handling wrapper for common operations
- Maintain existing API compatibility

### 2. Renderer Refactoring
- Replace repetitive `objc.msgSend` calls in `Renderer.init()`
- Use helper functions for vertex attribute configuration
- Standardize pipeline descriptor setup
- Maintain exact same functionality and behavior

### 3. Code Quality Improvements
- Reduce code duplication by ~60%
- Improve readability and maintainability
- Add consistent error handling patterns
- Maintain backward compatibility

### 4. Performance Considerations
- No performance regression expected
- Potential minor performance improvement from reduced function call overhead
- Maintain same memory allocation patterns

## Files to Modify

### Primary Files
1. `src/objc.zig` - Add helper functions
2. `src/renderer.zig` - Refactor initialization code

### Secondary Files (Potential Impact)
1. `src/main.zig` - May benefit from new helpers
2. `src/window.zig` - May benefit from new helpers

## Testing Requirements

### 1. Functional Testing
- Verify Metal rendering still works correctly
- Ensure all vertex attributes are properly configured
- Confirm pipeline state creation succeeds
- Test font rendering and glyph display

### 2. Compatibility Testing
- Build successfully with Zig 0.15.2
- Run on macOS with Metal support
- Verify no regression in terminal functionality

### 3. Performance Testing
- Measure initialization time
- Verify no memory leaks
- Confirm frame rate remains stable

## Success Criteria

### 1. Code Quality Metrics
- Reduce `objc.msgSend` calls by at least 50% in `renderer.zig`
- Improve code readability score
- Reduce cyclomatic complexity in initialization code

### 2. Functional Requirements
- Terminal rendering remains identical
- All features continue to work (selection, cursor, text input)
- No new compilation errors or warnings

### 3. Maintainability Requirements
- New code follows existing patterns and conventions
- Helper functions are well-documented
- Code is easier to extend for future features

## Constraints

### 1. Technical Constraints
- Must work with Zig 0.15.2
- Must maintain Objective-C runtime compatibility
- Cannot introduce new dependencies

### 2. Functional Constraints
- Cannot change existing public APIs
- Must maintain exact same behavior
- Cannot break existing functionality

### 3. Project Constraints
- Follow existing code style and conventions
- Maintain memory safety
- Preserve error handling patterns

## Related Code Patterns

The refactoring should consider similar patterns in other files:

- `src/window.zig` - NSApplication and NSWindow setup
- `src/main.zig` - Metal device and screen setup
- `src/pty.zig` - PTY setup and configuration

## Deliverables

### 1. Code Changes
- Modified `src/objc.zig` with new helper functions
- Refactored `src/renderer.zig` initialization code
- Updated documentation for new helpers

### 2. Test Results
- Functional test results
- Performance benchmark comparisons
- Compatibility test results