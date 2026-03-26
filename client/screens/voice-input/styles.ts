import { StyleSheet } from 'react-native';
import { Spacing, BorderRadius, Theme } from '@/constants/theme';

export const createStyles = (theme: Theme) => {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing['2xl'],
      paddingTop: Spacing['2xl'],
      paddingBottom: Spacing.xl,
      backgroundColor: theme.backgroundRoot,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.full,
      backgroundColor: theme.backgroundTertiary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    placeholder: {
      width: 40,
    },
    content: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing['2xl'],
    },
    instructionContainer: {
      alignItems: 'center',
      marginBottom: Spacing['4xl'],
    },
    timerContainer: {
      alignItems: 'center',
      marginBottom: Spacing['3xl'],
    },
    recordButtonContainer: {
      marginBottom: Spacing['4xl'],
    },
    recordButton: {
      width: 120,
      height: 120,
      borderRadius: BorderRadius.full,
      backgroundColor: theme.primary,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 12,
    },
    recordButtonActive: {
      backgroundColor: theme.error,
      shadowColor: theme.error,
    },
    recordButtonDisabled: {
      backgroundColor: theme.textMuted,
      shadowColor: theme.textMuted,
      opacity: 0.6,
    },
    tipsContainer: {
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing['3xl'],
    },
  });
};
