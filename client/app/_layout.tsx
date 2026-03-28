import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import Toast from 'react-native-toast-message';
import { AuthProvider } from "@/contexts/AuthContext";
import { ColorSchemeProvider } from '@/hooks/useColorScheme';

LogBox.ignoreLogs([
  "TurboModuleRegistry.getEnforcing(...): 'RNMapsAirModule' could not be found",
  // 添加其它想暂时忽略的错误或警告信息
]);

export default function RootLayout() {
  return (
    <AuthProvider>
      <ColorSchemeProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <StatusBar style="dark"></StatusBar>
          <Stack screenOptions={{
            animation: 'slide_from_right',
            gestureEnabled: true,
            gestureDirection: 'horizontal',
            headerShown: false
          }}>
            <Stack.Screen name="login" options={{ title: "登录" }} />
            <Stack.Screen name="index" options={{ title: "" }} />
            <Stack.Screen name="dashboard" options={{ title: "跟进仪表盘" }} />
            <Stack.Screen name="add-customer" options={{ title: "添加客户" }} />
            <Stack.Screen name="customer-detail" options={{ title: "客户详情" }} />
            <Stack.Screen name="customer-analysis" options={{ title: "深度分析" }} />
            <Stack.Screen name="voice-input" options={{ title: "语音录入" }} />
            <Stack.Screen name="generate-messages" options={{ title: "生成话术" }} />
            <Stack.Screen name="employee-management" options={{ title: "员工管理" }} />
            <Stack.Screen name="profile" options={{ title: "个人中心" }} />
            <Stack.Screen name="store-settings" options={{ title: "门店设置" }} />
            <Stack.Screen name="statistics" options={{ title: "数据统计" }} />
            <Stack.Screen name="create-store-owner" options={{ title: "创建门店账号" }} />
            <Stack.Screen name="store-management" options={{ title: "门店管理" }} />
          </Stack>
          <Toast />
        </GestureHandlerRootView>
      </ColorSchemeProvider>
    </AuthProvider>
  );
}
