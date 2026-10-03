import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, LogOut, RefreshCw, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { checkNeteaseQr, createNeteaseQr, disconnectNetease, getNeteaseLoginStatus } from '../lib/api'

const statusText: Record<number, string> = { 800: '二维码已过期，请刷新', 801: '等待扫码', 802: '请在网易云音乐 App 中确认', 803: '登录成功' }

export function AccountPage() {
  const client = useQueryClient()
  const status = useQuery({ queryKey: ['netease-login-status'], queryFn: getNeteaseLoginStatus, retry: false })
  const qr = useMutation({ mutationFn: createNeteaseQr })
  const logout = useMutation({ mutationFn: disconnectNetease, onSuccess: () => { qr.reset(); void client.invalidateQueries({ queryKey: ['netease-login-status'] }) } })
  const [qrStatus, setQrStatus] = useState<number | null>(null)
  const [qrError, setQrError] = useState('')

  useEffect(() => {
    if (!qr.data?.key || qrStatus === 803 || qrStatus === 800) return
    let active = true
    const timer = window.setInterval(() => {
      void checkNeteaseQr(qr.data.key).then((result) => {
        if (!active) return
        setQrStatus(result.code)
        if (result.authenticated) {
          setQrError('')
          void client.invalidateQueries({ queryKey: ['netease-login-status'] })
          void client.invalidateQueries({ queryKey: ['catalog-home'] })
        }
      }).catch((error: Error) => { if (active) setQrError(error.message) })
    }, 2500)
    return () => { active = false; window.clearInterval(timer) }
  }, [qr.data?.key, qrStatus, client])

  const authenticated = status.data?.authenticated
  return <div className="immersive-page account-page page-with-player">
    <div className="ambient-petals" />
    <div className="account-layout">
      <div className="account-heading"><span className="eyebrow">MY MUSIC</span><h1>个人中心</h1><p>与你喜欢的音乐，在这里相遇。</p></div>
      <section className="account-card glass-panel">
        <div className="account-card-header"><span className="account-icon"><UserRound size={25} /></span><div><h2>网易云音乐</h2><p>{authenticated ? '已连接 · 可以获取你的账号内容' : '扫码连接你的网易云账号'}</p></div></div>
        {status.isPending ? <p className="account-message">正在检查登录状态…</p> : null}
        {status.isError ? <p className="account-message error">{status.error.message}<button type="button" onClick={() => status.refetch()}>重试</button></p> : null}
        {authenticated ? <div className="account-profile">
          {status.data?.profile?.avatarUrl ? <img src={status.data.profile.avatarUrl} alt="网易云头像" /> : <span className="account-avatar">♫</span>}
          <div><strong>{status.data?.profile?.nickname || '网易云用户'}</strong><small>UID {status.data?.profile?.userId ?? status.data?.account?.id ?? '—'}</small></div>
          <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut size={17} />{logout.isPending ? '退出中…' : '退出登录'}</button>
        </div> : null}
        {!authenticated && !status.isPending ? <div className="qr-area">
          {qr.data?.qrImage ? <img className="qr-image" src={qr.data.qrImage} alt="网易云音乐登录二维码" /> : <div className="qr-placeholder">♫</div>}
          <div><h3>{qr.data ? statusText[qrStatus ?? 801] ?? '等待扫码' : '使用网易云音乐 App 扫码'}</h3><p>登录凭据由 TMusic 后端加密保存。请在手机上确认授权。</p>
            <button className="primary-pill" type="button" disabled={qr.isPending} onClick={() => { setQrStatus(null); setQrError(''); qr.mutate() }}><RefreshCw size={17} />{qr.data ? '刷新二维码' : '获取二维码'}<ArrowRight size={16} /></button>
            {qr.isError || qrError ? <p className="account-message error">{qrError || qr.error?.message}</p> : null}
          </div>
        </div> : null}
      </section>
    </div>
  </div>
}
