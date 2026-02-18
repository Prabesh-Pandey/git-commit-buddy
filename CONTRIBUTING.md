# Contributing to Git Commit Buddy

Thanks for your interest in contributing! Here's how to get started.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Create a feature branch: `git checkout -b feature/my-change`
4. Make your changes in the `extension/dist/` directory
5. Test the extension locally in VS Code
6. Commit with a descriptive message following [Conventional Commits](https://www.conventionalcommits.org/)
7. Push and open a Pull Request

## Development Setup

```bash
cd extension
npm install
```

To test locally, open the `extension/` folder in VS Code and press `F5` to launch the Extension Development Host.

## Code Style

- Use `"use strict";` at the top of all JS files
- Add JSDoc comments for all public functions
- Follow the existing modular architecture in `dist/modules/`

## Reporting Issues

- Use GitHub Issues to report bugs
- Include your VS Code version and OS
- Provide steps to reproduce the issue

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
