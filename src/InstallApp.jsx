import { useEffect, useRef, useState } from 'react'
import { Download, X } from 'lucide-react'
export default function InstallApp() {
  const [prompt, setPrompt] = useState(null), [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true), [help, setHelp] = useState(false), [busy, setBusy] = useState(false)
  const dialog = useRef(null)
  useEffect(() => {
    const capture = event => { event.preventDefault(); setPrompt(event) }
    const done = () => { setInstalled(true); setPrompt(null); setHelp(false) }
    const display = window.matchMedia('(display-mode: standalone)')
    const changed = () => setInstalled(display.matches || navigator.standalone === true)
    window.addEventListener('beforeinstallprompt', capture); window.addEventListener('appinstalled', done); display.addEventListener('change', changed)
    return () => { window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', done); display.removeEventListener('change', changed) }
  }, [])
  useEffect(() => { if (help) dialog.current.showModal() }, [help])
  async function install() {
    if (!prompt) return setHelp(true)
    setBusy(true)
    try { await prompt.prompt(); const choice = await prompt.userChoice; if (choice.outcome === 'accepted') setInstalled(true) } catch { setHelp(true) } finally { setPrompt(null); setBusy(false) }
  }
  if (installed) return null
  return <><section className="container install-app" aria-label="Instalar ClubeOn"><img src="/icons/icon-192.png" alt=""/><div><h2>ClubeOn no seu celular</h2><p>Encontre espaços e serviços para festas com um toque.</p></div><button className="button outline" disabled={busy} onClick={install}><Download size={17}/>{busy ? 'Aguarde…' : 'Instalar aplicativo'}</button></section>{help && <dialog ref={dialog} className="modal install-help" onCancel={event => { event.preventDefault(); setHelp(false) }} aria-labelledby="install-title"><div className="modal-head"><h2 id="install-title">Instalar ClubeOn</h2><button className="icon-button" aria-label="Fechar instruções de instalação" onClick={() => setHelp(false)} autoFocus><X/></button></div><p>Deixe o ClubeOn na tela inicial para abrir quando precisar.</p><h3>No Android</h3><p>Abra este site no Chrome. No menu do navegador, procure <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</p><h3>No iPhone</h3><p>Abra este site no Safari, toque em <strong>Compartilhar</strong> e escolha <strong>Adicionar à Tela de Início</strong>.</p><h3>No computador</h3><p>No Chrome ou Edge, procure a opção de instalação na barra de endereço ou no menu.</p><p className="form-footnote">Se abriu pelo Instagram ou WhatsApp, use a opção de abrir no navegador para instalar.</p></dialog>}</>
}
