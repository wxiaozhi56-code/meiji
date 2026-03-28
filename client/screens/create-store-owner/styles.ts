import { StyleSheet } from 'react-native';
import { Spacing, BorderRadius, Theme } from '@/constants/theme';

export const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing['2xl'],
      paddingBottom: Spacing['3xl'],
    },
    header: {
      marginBottom: Spacing['2xl'],
    },
    infoCard: {
      backgroundColor: theme.backgroundDefault,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.xl,
      borderLeftWidth: 4,
      borderLeftColor: theme.primary,
    },
    form: {
      gap: Spacing.lg,
    },
    inputGroup: {
      gap: Spacing.sm,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.backgroundTertiary,
      borderRadius: BorderRadius.lg,
      paddingHorizontal: Spacing.lg,
    },
    inputIcon: {
      marginRight: Spacing.md,
    },
    input: {
      flex: 1,
      paddingVertical: Spacing.lg,
      fontSize: 16,
      color: theme.textPrimary,
    },
    eyeButton: {
      padding: Spacing.sm,
    },
    submitButton: {
      backgroundColor: theme.primary,
      borderRadius: BorderRadius.lg,
      paddingVertical: Spacing.xl,
      alignItems: 'center',
      marginTop: Spacing.xl,
    },
    submitButtonDisabled: {
      backgroundColor: theme.textMuted,
    },
    backButton: {
      padding: Spacing.sm,
    },
    navHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.xl,
    },
    placeholder: {
      width: 40,
    },
  });
};
