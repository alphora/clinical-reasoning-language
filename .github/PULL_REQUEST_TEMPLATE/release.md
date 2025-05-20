# 📦 Release PR Checklist

_This checklist is for release branches (e.g., `release/v0.1.0`)._

## ✅ Checklist

- [ ] Update your local main branch to the latest
- [ ] Create a release branch (`release/v<version>`)
- [ ] Remove all debugging logs
- [ ] Run the linter with auto-fix
- [ ] Commit all changes
- [ ] Run tests to ensure there's no regression
- [ ] Run the release script
- [ ] Push commits and tags
- [ ] Merge the PR
- [ ] Create and publish GitHub Release
- [ ] Switch back to main and delete the release branch

---

## 📦 Distribution: GitHub Releases

This package is distributed via GitHub Releases.

To create a new release:

1. **Update your local main branch to the latest:**

   ```bash
   git checkout main
   git pull
   ```

2. **Create a release branch**  
   Example:

   ```bash
   git checkout -b release/v0.1.0
   ```

3. **Remove all debugging logs**  
   Prompt:
   > Search for and remove all console.log statements with messages prefixed with [DEBUGGING].  Don't remove from instructions or documentation, only functional code.

4. **Run the linter with auto-fix:**

   ```bash
   npx eslint . --ext .ts --fix
   ```

5. **Build the project**

   ```bash
   npm run build
   ```

6. **Run tests to ensure no regression**

   ```bash
   npm test
   ```

7. **Commit all changes**

   ```bash
   git add .
   git commit -m "Prepare release v0.1.0"
   ```

8. **Run the automated release script**

   ```bash
   npm run prerelease -- <patch|minor|major|version>
   ```

   Example:

   ```bash
   npm run prerelease -- minor
   ```

   This script will:
   - Build the project
   - Bump the version and create a Git tag
   - Push commits and tags

9. **Create and merge the Pull Request (PR)**

10. **Create and publish the GitHub Release**
    - Use the version tag (e.g., `v0.1.0`)
    - Generate release notes automatically if needed

11. **Switch back to main and delete the release branch:**

    ```bash
    git checkout main
    git branch -D release/v0.1.0
    ```

---

### ⚠️ Important

- The release script expects a **clean working directory** (no unstaged or uncommitted changes).  
  If your working directory is not clean, the script will exit and prompt you to commit, stash, or discard your changes.

- If a rollback warning is shown (e.g., after a failed release), manual intervention may be required to fully undo changes that were already pushed to the remote repository.  
  Check your git log and tags, and clean up as needed.

---

### 💡 Note

You do **NOT** need to attach a `.tgz` file for GitHub-based npm installs.
