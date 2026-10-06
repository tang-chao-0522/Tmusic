import Taro, { useDidShow } from '@tarojs/taro'
import { Image, Input, ScrollView, Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'
import { accountOverview, accountStatus, disconnect, loginWithPhone, sendLoginCaptcha, type Account } from '../../lib/api'
import { Button, Card, HERO, MiniPlayer, Page } from '../../components/ui'

export default function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null)
  const [likedCount, setLikedCount] = useState(0)
  const [phone, setPhone] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = () => accountStatus().then(status => { setAccount(status); if (status.authenticated) accountOverview().then(data => setLikedCount(data.likedCount || 0)).catch(() => undefined) }).catch(e => setError(e.message))
  useDidShow(refresh)
  useEffect(() => { if (seconds < 1) return; const timer = setTimeout(() => setSeconds(seconds - 1), 1000); return () => clearTimeout(timer) }, [seconds])
  const send = () => { if (!/^1[3-9]\d{9}$/.test(phone) || busy || seconds) { if (!seconds) setError('请输入有效的手机号'); return }; setError(''); setBusy(true); sendLoginCaptcha(phone).then(data => setSeconds(data.retryAfterSeconds)).catch(e => setError(e.message)).finally(() => setBusy(false)) }
  const login = () => { if (!/^1[3-9]\d{9}$/.test(phone) || !/^\d{4,8}$/.test(captcha) || busy) { setError('请输入手机号和短信验证码'); return }; setError(''); setBusy(true); loginWithPhone(phone, captcha).then(() => { setCaptcha(''); refresh() }).catch(e => setError(e.message)).finally(() => setBusy(false)) }
  return <Page active="/pages/account/index"><ScrollView scrollY className="page-scroll content-scroll"><View className="profile-head" style={{ backgroundImage: `linear-gradient(180deg,#10173355,#101733),url(${HERO})` }}><Text className="eyebrow">MY AURORA</Text><View className="profile-avatar">{account?.profile?.avatarUrl ? <Image src={account.profile.avatarUrl} /> : <Text>✦</Text>}</View><Text className="page-title">{account?.profile?.nickname || 'Aurora'}</Text><Text>{account?.profile?.signature || '晚上音乐，继续照亮你的日常。'}</Text><View className="profile-stats"><Text>{account?.profile?.playlistCount || 0}　歌单</Text><Text>{likedCount}　喜欢</Text><Text>{account?.listenSongs || 0}　听过</Text></View></View>
    {error && <Text className="error-text">{error}</Text>}
    {!account?.authenticated ? <Card className="account-card"><Text className="heading">登录网易云音乐</Text><Text>使用绑定的手机号接收验证码，同步你的歌单和喜欢的歌曲。</Text><Input className="login-input" value={phone} type="number" maxlength={11} placeholder="网易云绑定的手机号" onInput={e => setPhone(e.detail.value)} /><View className="captcha-line"><Input className="login-input" value={captcha} type="number" maxlength={8} placeholder="短信验证码" onInput={e => setCaptcha(e.detail.value)} /><Text onClick={send}>{seconds ? `${seconds}s 后重试` : '获取验证码'}</Text></View><Button onClick={login}>{busy ? '请稍候…' : '登录并同步音乐'}</Button></Card> : <><View className="section-heading"><Text className="heading">我的音乐人格</Text></View><Card className="personality-card"><Text>✿　日系 · 治愈 · 城市流行</Text><Text>「音乐是我，与这个世界温柔相处的方式。」</Text></Card><View className="mood-grid">{['日系', '治愈', '城市流行', '钢琴', '夜晚', '温柔'].map(tag => <Text className="mood" key={tag}>{tag}</Text>)}</View><Button ghost onClick={() => disconnect().then(() => { setAccount(null); setLikedCount(0) }).catch(e => setError(e.message))}>退出网易云账号</Button></>}
    <View className="section-heading"><Text className="heading">我的收藏</Text><Text className="link" onClick={() => Taro.redirectTo({ url: '/pages/library/index' })}>进入音乐库 ›</Text></View><Card className="collection-card"><Text>♫</Text><View><Text className="track-name">喜欢的音乐</Text><Text className="track-artist">收藏每一个心动瞬间</Text></View></Card>
  </ScrollView><MiniPlayer /></Page>
}
