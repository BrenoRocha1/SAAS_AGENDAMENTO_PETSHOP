import { Stack } from 'expo-router'

export const unstable_settings = { anchor: 'index' }

export default function PetsClienteLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="novo" />
      <Stack.Screen name="[id]" />
    </Stack>
  )
}
