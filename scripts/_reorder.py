import io

p = r'F:\ai数学\scripts\shot-cloth.mjs'
s = io.open(p, encoding='utf-8').read()

old = """  // 滚轮拉近看细节"""
assert old in s

# 把最终截图移到缩放之前
block_start = s.index("  // 滚轮拉近看细节")
block_end = s.index("  const s = await send('Page.captureScreenshot'", block_start)
zoom_block = s[block_start:block_end]

tail_start = s.index("  const s = await send('Page.captureScreenshot'", block_start)
tail_end = s.index("  console.log('saved')", tail_start)
tail = s[tail_start:tail_end]

s = s[:block_start] + tail + zoom_block + s[tail_end:]
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('reordered screenshots')
