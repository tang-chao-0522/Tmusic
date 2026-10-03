import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Clock3, Crown, Heart, ListMusic, LogOut, Music2, RefreshCw, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageTopbar } from '../components/layout/PageTopbar'
import { GlassPanel } from '../components/shared/GlassPanel'
import { Button } from '../components/ui/button'
import { RecentTracks } from '../components/music/RecentTracks'
import { checkNeteaseQr, createNeteaseQr, disconnectNetease } from '../lib/api'
import { clearAccountQueries, queries, queryKeys } from '../lib/queries'

const statusText: Record<number, string> = { 800: '二维码已过期，请刷新', 801: '等待扫码', 802: '请在网易云音乐 App 中确认', 803: '登录成功', 804: '正在加载个人资料…', 805: '扫码已确认，资料读取失败' }
const displayNumber = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('zh-CN')

export function AccountPage() {
  const client = useQueryClient()
  const status = useQuery(queries.accountStatus())
  const overview = useQuery({ ...queries.accountOverview(Number(status.data?.account?.id ?? 0)), enabled: Boolean(status.data?.authenticated) })
  const qr = useMutation({ mutationFn: createNeteaseQr })
  const [qrStatus, setQrStatus] = useState<number | null>(null)
  const [qrError, setQrError] = useState('')
  const logout = useMutation({ mutationFn: disconnectNetease, onSuccess: async () => {
    await client.cancelQueries({ queryKey: queryKeys.accountStatus })
    await clearAccountQueries(client)
    qr.reset()
    setQrStatus(null)
    client.setQueryData(queryKeys.accountStatus, { authenticated: false, account: null, profile: null })
    await client.invalidateQueries({ queryKey: queryKeys.catalogHome })
  } })

  useEffect(() => {
    if (!qr.data?.key) return
    let active = true
    let checking = false
    const onLoginSuccess = async () => {
      setQrStatus(804)
      try {
        await clearAccountQueries(client)
        let account = await client.fetchQuery({ ...queries.accountStatus(), staleTime: 0 })
        for (let attempt = 0; !account.authenticated && attempt < 2; attempt++) {
          await new Promise((resolve) => window.setTimeout(resolve, 600))
          account = await client.fetchQuery({ ...queries.accountStatus(), staleTime: 0 })
        }
        if (!active) return
        if (!account.authenticated) {
          setQrStatus(805)
          setQrError('扫码已确认，但账号状态尚未同步。请刷新二维码重试。')
          return
        }
        setQrError('')
        setQrStatus(803)
        await client.invalidateQueries({ queryKey: queryKeys.catalogHome })
      } catch (error) {
        if (!active) return
        setQrStatus(805)
        setQrError(error instanceof Error ? error.message : '读取账号信息失败，请重试')
      }
    }
    const timer = window.setInterval(() => {
      if (checking) return
      checking = true
      void checkNeteaseQr(qr.data.key).then((result) => {
        if (!active) return
        if (result.authenticated) {
          window.clearInterval(timer)
          void onLoginSuccess()
        } else {
          setQrStatus(result.code)
          if (result.code === 800) window.clearInterval(timer)
        }
      }).catch((error: Error) => { if (active) setQrError(error.message) }).finally(() => { checking = false })
    }, 2500)
    return () => { active = false; window.clearInterval(timer) }
  }, [qr.data?.key, client])

  const authenticated = Boolean(status.data?.authenticated)
  const profile = status.data?.profile
  const userId = profile?.userId ?? status.data?.account?.id
  const vipType = profile?.vipType ?? status.data?.account?.vipType
  const artists = overview.data?.artists

  return <div className="immersive-page account-page page-with-player">
    <PageTopbar /><div className="ambient-petals" />
    <div className="account-layout">
      <header className="account-heading"><span className="eyebrow">PERSONAL CENTER</span><h1>个人中心</h1><p>音乐在这里，陪你走过每一段旅程。</p></header>
      {status.isPending ? <GlassPanel className="account-feedback">正在读取账号信息…</GlassPanel> : null}
      {status.isError ? <GlassPanel className="account-feedback error">{status.error.message}<button type="button" onClick={() => void status.refetch()}>重试</button></GlassPanel> : null}
      {authenticated ? <div className="account-dashboard">
        <GlassPanel as="section" className="account-hero-card">
          <div className="account-identity">
            <div className="account-portrait">{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="个人头像" /> : <UserRound size={56} />}</div>
            <div className="account-identity-copy">
              <div className="account-name-row"><h2>{profile?.nickname || '网易云用户'}</h2><span className="account-verified">已连接网易云音乐</span></div>
              <p className="account-signature">{profile?.signature?.trim() || '让喜欢的音乐，陪伴每一天。'}</p>
              <div className="account-chips"><span>UID {userId ?? '—'}</span>{status.data?.level != null ? <span>Lv. {status.data.level}</span> : null}{profile?.createTime ? <span>{new Date(profile.createTime).getFullYear()} 年加入</span> : null}</div>
            </div>
            {userId ? <a className="account-edit-link" href={`https://music.163.com/#/user/home?id=${userId}`} target="_blank" rel="noreferrer">查看网易云主页 <ArrowRight size={15} /></a> : null}
          </div>
          <div className="account-metrics">
            <Metric value={profile?.follows} label="关注" /><Metric value={profile?.followeds} label="粉丝" /><Metric value={profile?.playlistCount} label="歌单" /><Metric value={overview.data?.likedCount} label="喜欢的歌曲" /><Metric value={status.data?.listenSongs} label="累计听歌" />
          </div>
        </GlassPanel>
        <GlassPanel as="section" className="account-listening-card">
          <div className="account-panel-title"><div><Clock3 size={21} /><h3>聆听数据</h3></div><span>来自网易云音乐</span></div>
          <div className="account-listen-number"><strong>{displayNumber(status.data?.listenSongs)}</strong><span>累计听歌</span></div>
          <p>你的音乐旅程，每一首都有回声。</p>
          <div className="account-listening-details"><div><span>当前等级</span><strong>{status.data?.level != null ? `Lv. ${status.data.level}` : '暂无数据'}</strong></div><div><span>加入天数</span><strong>{status.data?.createDays != null ? `${displayNumber(status.data.createDays)} 天` : '暂无数据'}</strong></div></div>
        </GlassPanel>
        <GlassPanel as="section" className="account-recent-card">
          <div className="account-panel-title"><div><Music2 size={21} /><h3>最近听过</h3></div><Link to="/library">音乐库 <ArrowRight size={15} /></Link></div>
          {userId ? <RecentTracks userId={userId} /> : <p className="account-empty">无法读取账号 UID</p>}
        </GlassPanel>
        <GlassPanel as="section" className="account-artists-card">
          <div className="account-panel-title"><div><Heart size={20} /><h3>关注的歌手</h3></div><Link to="/library">查看全部 <ArrowRight size={15} /></Link></div>
          {overview.isPending ? <p className="account-empty">正在加载关注歌手…</p> : artists?.length ? <div className="account-artist-list">{artists.map((artist) => <div className="account-artist" key={artist.id}><div>{artist.coverUrl ? <img src={artist.coverUrl} alt="" /> : <Music2 size={24} />}</div><span title={artist.name}>{artist.name}</span></div>)}</div> : <p className="account-empty">{artists === null || overview.isError ? '关注歌手暂时不可用' : '还没有关注的歌手'}</p>}
        </GlassPanel>
        <GlassPanel as="section" className="account-membership-card">
          <div className="account-panel-title"><div><Crown size={21} /><h3>账号与会员</h3></div></div>
          <div className="account-membership-body"><div className="account-membership-icon"><Crown size={29} /></div><div><strong>{vipType ? '网易云音乐会员' : '网易云音乐账号'}</strong><p>{vipType ? '会员状态以网易云音乐 App 显示为准' : '已连接，可以同步个人音乐内容'}</p></div></div>
          <div className="account-actions"><Link to="/library"><ListMusic size={17} />我的音乐库</Link><button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut size={17} />{logout.isPending ? '退出中…' : '退出登录'}</button></div>
          {logout.isError ? <p className="account-message error">{logout.error.message}</p> : null}
        </GlassPanel>
      </div> : !status.isPending && !status.isError ? <GlassPanel as="section" className="account-login-card">
        <div className="account-panel-title"><div><UserRound size={21} /><h3>连接网易云音乐</h3></div></div>
        <div className="account-login-content"><div className="account-qr-wrap">{qr.data?.qrImage ? <img src={qr.data.qrImage} alt="网易云音乐登录二维码" /> : <Music2 size={52} />}</div><div><h2>{qr.data ? statusText[qrStatus ?? 801] ?? '等待扫码' : status.data?.needsReconnect ? '登录已失效，请重新扫码' : '扫码开启你的个人音乐空间'}</h2><p>使用网易云音乐 App 扫描二维码并确认授权，随后即可查看你的真实账号资料与音乐数据。</p><Button className="primary-pill" variant="aurora" size="lg" type="button" disabled={qr.isPending} onClick={() => { setQrStatus(null); setQrError(''); qr.mutate() }}><RefreshCw size={17} />{qr.data ? '刷新二维码' : '获取二维码'}<ArrowRight size={16} /></Button>{status.data?.needsReconnect ? <button className="account-clear-connection" type="button" disabled={logout.isPending} onClick={() => logout.mutate()}>清除旧连接</button> : null}{qr.isError || qrError ? <p className="account-message error">{qrError || qr.error?.message}</p> : null}{logout.isError ? <p className="account-message error">{logout.error.message}</p> : null}</div></div>
      </GlassPanel> : null}
    </div>
  </div>
}

function Metric({ value, label }: { value: number | null | undefined; label: string }) {
  return <div className="account-metric"><strong>{displayNumber(value)}</strong><span>{label}</span></div>
}
