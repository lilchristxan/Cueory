/**
 * Browser keys a survey prompt may write (SurveyPrompt.tsx): the default dismissal key and the one the unlinked
 * preview page passes. Listed on /privacy and cleared by delete-my-account (Task 200). Plain .ts so deleteaccount.ts
 * never imports React.
 */
export const SURVEY_STORAGE_KEYS = ['cueory-finals-survey-dismissed', 'cueory-preview-survey'] as const;
