// Dead On AI brand tokens for the pane.
export const BRAND = {
  ground: '#080D14',
  panel: '#0D141F',
  orange: '#FF681F',
  cyan: '#7DD3FC',
  slate: '#8D9AA8',
  bone: '#F3F0E8',
} as const

// "DEAD ON AI" wordmark: orange ON, cyan target.
// Pass the Box/Text from $.ui.resolve(e).
export function Wordmark({ els }: { els: { Box: any; Text: any } }) {
  const { Box, Text } = els
  return (
    <Box>
      <Text weight="bold" color={BRAND.bone}>DEAD </Text>
      <Text weight="bold" color={BRAND.orange}>ON</Text>
      <Text weight="bold" color={BRAND.bone}> AI </Text>
      <Text color={BRAND.cyan}>◎</Text>
    </Box>
  )
}
