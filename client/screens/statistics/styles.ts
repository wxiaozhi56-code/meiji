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
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderLight,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.backgroundTertiary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    placeholder: {
      width: 40,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: Spacing.lg,
      paddingBottom: Spacing['5xl'],
    },
    section: {
      marginBottom: Spacing.xl,
    },
    statsGrid: {
      flexDirection: 'row',
      gap: Spacing.md,
      marginTop: Spacing.sm,
    },
    statCard: {
      flex: 1,
      backgroundColor: theme.backgroundDefault,
      borderRadius: BorderRadius.xl,
      padding: Spacing.lg,
      alignItems: 'center',
    },
    statCardClickable: {
      // 可点击卡片的特殊样式
    },
    statIconContainer: {
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    tipCard: {
      flexDirection: 'row',
      backgroundColor: theme.backgroundDefault,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      gap: Spacing.md,
      marginTop: Spacing.lg,
    },
    tipContent: {
      flex: 1,
      gap: Spacing.xs,
    },
  });
};
