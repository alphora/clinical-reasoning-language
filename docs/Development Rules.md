# Development Rules

## **Development Practices**
- **Always use TypeScript** for all coding implementations.
- **Ensure clarity before implementation**:
  - **Ask clarifying questions** if anything is unclear.
  - **Take time to understand** before proceeding.

## **Cross-Platform Development Considerations**
- **I develop on a Windows machine**, so consider Windows-specific behaviors when running commands.
- The project **must run on Windows, Mac, and Linux**, so:
  - Always implement changes in a **cross-platform manner**.
  - Use **platform-independent commands** where possible.
  - If a script requires a platform-specific adjustment, ensure there is a cross-platform equivalent.

## General Coding Principles
- **Always prefer simple solutions** to minimize complexity.
- **Avoid code duplication** by checking for existing similar functionality within the codebase before adding new code.
- **Ensure code compatibility** across different environments: **development (dev), testing (test), and production (prod).**
- **Make only necessary changes** that are either explicitly requested or well understood to be relevant.

## Bug Fixing and Refactoring
- **When fixing bugs**, do not introduce new patterns or technologies without first attempting to work within the existing implementation.
- If a new pattern or technology is introduced, **remove old implementations** to avoid redundant logic.
- **Refactor** any file exceeding **200-300 lines of code** for better maintainability.
- **Fix root causes** instead of adding protective code.
- **Logging should not break existing functionality**.
- **Always prefix debugging logs with `[DEBUGGING]`** so they can be easily removed.
- **Avoid intrusive logging changes** that modify code behavior.
- **If encountering file read timeouts**, do not blindly try alternative solutions.
  - 🚀 *Prompt for discussion to determine the best way to retrieve the necessary information.*
- **When running commands**, always open a new terminal.

## Code Organization and Maintainability
- **Keep the codebase clean and well-organized** to improve readability and maintainability.
- **Avoid writing standalone scripts** in files if they are only intended to be executed once.

## Data Handling and Mocking
- **Mocking data should only be used for testing** and never for development or production environments.
- **Do not add stubbing or fake data patterns** that could impact development or production.

## Environment and Configuration Management
- **Never overwrite the `.env` file** without explicit confirmation to prevent misconfigurations.

## **Pre-Commit Code Verification Guidelines**

Follow these rules to ensure code quality before committing changes:

### 1. Compilation Check

**Always verify that your code compiles successfully before committing.**

```bash
npm run compile
```

- ✅ **Success**: No output indicates successful compilation
- ❌ **Failure**: TypeScript errors will be displayed with file paths and line numbers
- 🛠️ **Action**: Fix all compilation errors before proceeding

### 2. Linting Check

**After successful compilation, verify code quality with ESLint.**

For checking specific files you've modified:
```bash
npx eslint src/path/to/modified/file.ts
```

For checking an entire directory:
```bash
npx eslint src/features/someFeature --ext .ts
```

- ✅ **Success**: No output indicates no linting issues
- ❌ **Failure**: ESLint will display warnings and errors
- 🛠️ **Action**: Address all errors and consider addressing warnings

### 3. When to Run Verification

Run these checks:
- ✓ After implementing a feature
- ✓ After refactoring code
- ✓ After fixing bugs
- ✓ Before creating a commit
- ✓ Before pushing to a shared branch

### 4. Handling Issues

If you encounter issues:

1. **Fix compilation errors first** - The code must compile before addressing style issues
2. **Address ESLint errors** - These often indicate potential bugs or code quality issues
3. **Consider ESLint warnings** - These suggest improvements but may not block commits
4. **Recheck after fixes** - Run verification again after making changes
5. **Document persistent issues** - If an issue cannot be fixed immediately, document why

### 5. Automation Tips

Consider using:
- Git pre-commit hooks to automate these checks
- VS Code's built-in ESLint extension for real-time feedback
- The `--fix` flag with ESLint to automatically fix simple issues:
  ```bash
  npx eslint src/path/to/file.ts --fix
  ```

## **Git Workflow**

### **Commit Strategy**:
- **Make frequent, smaller commits** rather than a single large commit at the end.
- Each commit should represent a **logical unit of work** that:
  - Compiles successfully
  - Passes linting checks
  - Represents a complete thought or feature component
- **Good commit timing examples**:
  - After setting up the basic structure for a new feature
  - After implementing core functionality
  - After adding tests
  - After refactoring for cleaner code
  - After fixing a bug
  - After updating documentation

### **Commit Messages**:
- Write clear, concise commit messages that explain:
  - **What** was changed (in 50 characters or less)
  - **Why** it was changed (if needed, in the description)
  ```bash
  git commit -m "Add user authentication component"
  ```
  Or for more complex changes:
  ```bash
  git commit -m "Refactor dependency analyzer
  
  - Improve performance by caching results
  - Fix memory leak in graph rendering
  - Simplify interface for better usability"
  ```

### **Verification Before Commits**:
- **Always run verification checks** before creating a commit:
  ```bash
  npm run compile
  npx eslint src/path/to/modified/file.ts
  ```

## **Benefits**

Following these guidelines ensures:
- Fewer bugs in production
- More maintainable codebase
- Consistent code style
- Smoother code reviews
- Reduced technical debt
- Cross-platform compatibility
- **Clear development history** with logical, incremental changes
- **Easier bug identification** through smaller, focused commits
- **Simplified code reviews** by grouping related changes 

## Git Command Pager Handling in Windows

### Problem

When running Git commands that produce large outputs in Windows environments, Git automatically uses a pager (like `less`) which:
- Requires interaction (pressing space/q to continue/quit)
- Can cause automation issues when run through programmatic interfaces
- Creates stray files when commands are interrupted

### Solution: The `--no-pager` Flag

Always use the `--no-pager` flag with Git commands that might produce paginated output in Windows environments.

```bash
git --no-pager <command>
```

### Affected Commands

The following Git commands typically invoke a pager and should be used with the `--no-pager` flag:

| Command | Recommended Usage |
|---------|------------------|
| `git log` | `git --no-pager log` |
| `git diff` | `git --no-pager diff` |
| `git blame` | `git --no-pager blame` |
| `git branch` | `git --no-pager branch` |
| `git tag` | `git --no-pager tag` |
| `git show` | `git --no-pager show` |

### Examples

```bash
# View commit history without pagination
git --no-pager log

# View specific commit details
git --no-pager show HEAD

# Display changes between commits
git --no-pager diff HEAD~1 HEAD

# List all branches
git --no-pager branch -a
```

### Alternative: Disable Pager Globally

To temporarily disable the pager for all Git commands in a session:

```bash
git config --global core.pager ""
```

To restore the default behavior:

```bash
git config --global --unset core.pager
```

### Benefits

- Prevents command interruption
- Avoids creating temporary files
- Makes Git commands more suitable for automation
- Provides consistent behavior across platforms
- Reduces errors in programmatic environments

### Best Practice

When writing scripts or automation that uses Git in Windows environments, always prefer the `--no-pager` approach to ensure consistent, non-interactive behavior. 

These principles ensure code maintainability, clarity, and reliability while fostering a clean and structured development environment. 🚀