Set-Location 'c:\Users\24729\Desktop\萌兽成长营\xintongxin'
$lines = Get-Content data.js -Encoding UTF8
# lines 1-2 = comment + window.PET_TYPES = [
# lines 3-156 = old pet entries + ];
# lines 157+ = rest
$head = $lines[0..1]   # comment line + 'window.PET_TYPES = ['
$tail = $lines[156..($lines.Count-1)]  # from '];' onward

$beasts = @(
"  { id:'qinglong', name:'青龙', icon:'🐉', desc:'东方之神，掌管风雨，翠鳞闪耀，守护四方安宁。', food:'⚡ 雷霆之力', breeds:[{id:'qinglong',name:'青龙',icon:'🐉'}] },",
"  { id:'baihu', name:'白虎', icon:'🐯', desc:'西方之神，威猛无双，百兽之王，镇守一方。', food:'🌟 星辰之力', breeds:[{id:'baihu',name:'白虎',icon:'🐯'}] },",
"  { id:'zhuque', name:'朱雀', icon:'🦅', desc:'南方之神，浴火重生，吉祥如意。', food:'🔥 火焰精华', breeds:[{id:'zhuque',name:'朱雀',icon:'🦅'}] },",
"  { id:'xuanwu', name:'玄武', icon:'🐢', desc:'北方之神，龟蛇合体，寿与天齐，稳如磐石。', food:'💧 玄冰之水', breeds:[{id:'xuanwu',name:'玄武',icon:'🐢'}] },",
"  { id:'fenghuang', name:'凤凰', icon:'🦚', desc:'百鸟之王，浴火重生，象征美好与希望。', food:'🌈 彩云之露', breeds:[{id:'fenghuang',name:'凤凰',icon:'🦚'}] },",
"  { id:'qinlin', name:'麒麟', icon:'🦄', desc:'仁兽，脚踏祥云，出现则天下太平。', food:'🌸 祥云花露', breeds:[{id:'qinlin',name:'麒麟',icon:'🦄'}] },",
"  { id:'pixiu', name:'貔貅', icon:'🦁', desc:'上古神兽，招财辟邪，镇宅护身。', food:'💰 金银之气', breeds:[{id:'pixiu',name:'貔貅',icon:'🦁'}] },",
"  { id:'yinglong', name:'应龙', icon:'🐲', desc:'有翼之龙，助黄帝战蚩尤，威震八方。', food:'☁️ 云雾之精', breeds:[{id:'yinglong',name:'应龙',icon:'🐲'}] },",
"  { id:'zhulong', name:'烛龙', icon:'🌟', desc:'人面龙身，口衔烛火，照耀幽冥之地。', food:'🕯️ 烛火之光', breeds:[{id:'zhulong',name:'烛龙',icon:'🌟'}] },",
"  { id:'taotie', name:'饕餮', icon:'👹', desc:'青铜器上的守护神纹，贪食之兽，凶猛异常。', food:'🍖 天地精华', breeds:[{id:'taotie',name:'饕餮',icon:'👹'}] },",
"  { id:'hundun', name:'混沌', icon:'🌀', desc:'天地未开之神，蕴含无尽能量，万物之源。', food:'🌌 宇宙之源', breeds:[{id:'hundun',name:'混沌',icon:'🌀'}] },",
"  { id:'jiuweihu', name:'九尾狐', icon:'🦊', desc:'千年修炼，九尾齐现，智慧与美丽并存。', food:'🌙 月华之光', breeds:[{id:'jiuweihu',name:'九尾狐',icon:'🦊'}] },",
"  { id:'jingwei', name:'精卫', icon:'🐦', desc:'炎帝之女溺海化鸟，衔石填海，永不言弃。', food:'🪨 海之碎石', breeds:[{id:'jingwei',name:'精卫',icon:'🐦'}] },",
"  { id:'jinwu', name:'金乌', icon:'☀️', desc:'三足神鸟，栖于太阳之中，掌管光明与温暖。', food:'🌞 日之精华', breeds:[{id:'jinwu',name:'金乌',icon:'☀️'}] },",
"  { id:'yutu', name:'玉兔', icon:'🐰', desc:'月宫神兽，手持玉杵捣药，善良温柔。', food:'🌿 仙草灵药', breeds:[{id:'yutu',name:'玉兔',icon:'🐰'}] },",
"  { id:'xiezhi', name:'獬豸', icon:'🦏', desc:'独角神兽，能辨善恶是非，公正之象征。', food:'⚖️ 正义之光', breeds:[{id:'xiezhi',name:'獬豸',icon:'🦏'}] },",
"  { id:'baize', name:'白泽', icon:'🦌', desc:'圣兽，能言语，知天下鬼神之事，黄帝得之。', food:'📖 智慧之书', breeds:[{id:'baize',name:'白泽',icon:'🦌'}] },",
"  { id:'tiangou', name:'天狗', icon:'🐺', desc:'流星化身，速如闪电，护主忠诚不二。', food:'🌠 流星之力', breeds:[{id:'tiangou',name:'天狗',icon:'🐺'}] },",
"  { id:'bifang', name:'毕方', icon:'🦩', desc:'木精之鸟，一足赤纹，出则有火灾，上古奇鸟。', food:'🔥 赤炎之木', breeds:[{id:'bifang',name:'毕方',icon:'🦩'}] },",
"  { id:'shanxiao', name:'山魈', icon:'🐒', desc:'人形独脚，好效人声，住山洞，山林之神。', food:'🍄 山林菌菇', breeds:[{id:'shanxiao',name:'山魈',icon:'🐒'}] }"
)

$newlines = $head + $beasts + @('];') + @('') + $tail
[System.IO.File]::WriteAllLines('data.js', $newlines, [System.Text.Encoding]::UTF8)
Write-Host ('OK lines=' + $newlines.Count)
