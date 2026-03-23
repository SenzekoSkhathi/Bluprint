# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

3. If you want BluBot and the handbook pipeline screen to use the FastAPI backend, start the backend first:

   ```bash
   cd Backend
   pip install -r requirements.txt
   uvicorn src.main:app --reload --port 8000
   ```

   Set `EXPO_PUBLIC_BACKEND_URL` when the app cannot reach `http://localhost:8000` directly, such as on Android emulators or physical devices.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Student Confidence MVP Release Acceptance

This release is accepted only when all criteria below are measurable and pass in staging/demo sessions.

### 1) Blocker prevention rate

- Metric: `blocked_invalid_save_attempts / blocker_triggered_save_attempts`
- Target: `>= 95%`
- Source of truth: Planner save-gate session metrics in app UI.

### 2) Save-gate behavior

- Requirement A: when blocker count `> 0`, save action is blocked and user receives explicit reason text.
- Requirement B: when blocker count is `0` and warning acknowledgement conditions are satisfied, save action is enabled.
- Requirement C: save-gate panel shows blockers, warnings, workload/schedule warnings, and affected terms before save.

### 3) Citation availability for rule failures

- Metric: `rule_failures_with_reference_or_source_text / total_rule_failures`
- Target: `>= 90%`
- Source of truth: Planner and BluBot issue/response panels showing `Why invalid`, `ruleReference`, `ruleSourceText`, or `Sources`.

### 4) Cross-session data consistency

- Requirement A: after successful save, reloading the app/session reproduces the same planned courses.
- Requirement B: Progress forecast derived from saved planner data matches Planner persisted state.
- Requirement C: trust messaging must show whether data is `Live backend guidance`, `Fallback guidance`, `Backend unavailable`, or `Stale backend data`.

## End-to-End Demo Script (Definition of Done)

Release is done when a single student journey can be shown end-to-end without data mismatch:

1. Login

- Sign in with a student account.
- Confirm trust state is visible and indicates live vs fallback mode.

2. Planning

- Add at least one intentionally invalid course sequence in Planner.
- Verify blocker(s) appear and save is blocked.

3. Validation

- Confirm blocker/warning cards explain why invalid and include handbook evidence where applicable.

4. Fix

- Adjust courses/terms to clear blocker(s).
- Re-run validation and verify blocker count returns to zero.

5. Save

- Save planner changes successfully.
- Confirm save notice and last-synced context update.

6. Progress update

- Open Progress and confirm projected/forecast courses reflect the saved plan.
- Confirm no cross-screen mismatch between Planner saved state and Progress derived data.

If any step fails or shows a mismatch, the release does not pass acceptance.
