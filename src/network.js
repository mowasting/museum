// الاتصال الأونلاين عن طريق Supabase Realtime (قناة Broadcast)
// pos = مكان اللاعب، chat = رسائل الدردشة
export function createNetwork(supabase, onPos, onStatus, onChat) {
  if (!supabase) return null

  const channel = supabase.channel('museum-main', {
    config: { broadcast: { self: false } },
  })

  let ready = false
  channel
    .on('broadcast', { event: 'pos' }, ({ payload }) => onPos(payload))
    .on('broadcast', { event: 'chat' }, ({ payload }) => onChat?.(payload))
    .subscribe((status) => {
      ready = status === 'SUBSCRIBED'
      onStatus?.(status)
    })

  return {
    send(payload) {
      if (!ready) return
      channel.send({ type: 'broadcast', event: 'pos', payload })
    },
    // يرجع false إذا الاتصال مو جاهز
    sendChat(payload) {
      if (!ready) return false
      channel.send({ type: 'broadcast', event: 'chat', payload })
      return true
    },
    close() {
      supabase.removeChannel(channel)
    },
  }
}
