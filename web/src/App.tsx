import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import CubePage from './CubePage'
import MyCardsPage from './MyCardsPage'
import DecksPage from './DecksPage'
import StatsPage from './StatsPage'
import { HistoryPage, PlayersPage, SetsPage } from './pages'
import { APK_URL } from './links'
import { supabase, type Profile } from './supabase'

const logout = () => supabase.auth.signOut()

function useHashRoute() {
  const read = () => location.hash.slice(1) || '/cube'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => setRoute(read())
    addEventListener('hashchange', onChange)
    return () => removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const route = useHashRoute()
  const userId = session?.user.id

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const load = async (retry: boolean) => {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
      // The profile is created by a trigger right after the first login.
      if (!data && retry) return setTimeout(() => !cancelled && load(false), 1500)
      if (!cancelled) setProfile(data)
    }
    load(true)
    return () => {
      cancelled = true
    }
  }, [userId])

  if (session === undefined || (session && profile === undefined)) {
    return <p className="center muted">Lädt …</p>
  }

  if (!session) {
    return (
      <div className="center gate">
        <h1 className="gate-title">
          <img className="gate-logo" src="./logo.png" alt="Cube Vault" />
        </h1>
        <p className="muted">Der Cube ist nur für freigegebene Spieler sichtbar.</p>
        <button
          className="primary"
          onClick={() =>
            supabase.auth.signInWithOAuth({
              provider: 'discord',
              options: {
                redirectTo: location.origin + location.pathname,
                // Discord skips its own screen once you have authorized the app.
                queryParams: { prompt: 'none' },
              },
            })
          }
        >
          Mit Discord anmelden
        </button>
        <p className="muted">
          Zum Scannen:{' '}
          <a
            href={APK_URL}
            target="_blank"
            rel="noopener"
          >
            Android-App laden
          </a>
        </p>
      </div>
    )
  }

  if (!profile || profile.role === 'waiting') {
    return (
      <div className="center gate">
        <h1 className="gate-title">
          <img className="gate-logo" src="./logo.png" alt="Cube Vault" />
        </h1>
        <p>{profile ? 'Warte auf Freigabe durch einen Admin.' : 'Dein Profil wurde nicht gefunden.'}</p>
        <p className="muted">Sobald du freigegeben bist, lade die Seite neu.</p>
        <button onClick={logout}>Abmelden</button>
      </div>
    )
  }

  const nav = [
    ['/cube', 'Cube'],
    ['/mine', 'Meine Karten'],
    ['/decks', 'Decks'],
    ['/stats', 'Auswertung'],
    ['/history', 'Verlauf'],
    ['/sets', 'Sets'],
    ...(profile.role === 'admin' ? [['/players', 'Spieler']] : []),
  ]

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#/cube" aria-label="Cube Vault">
          <img src="./logo.png" alt="" />
        </a>
        <nav aria-label="Hauptnavigation">
          {nav.map(([path, label]) => (
            <a key={path} href={`#${path}`} aria-current={route === path ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <a className="apk" href={APK_URL} target="_blank" rel="noopener">
          App laden
        </a>
        <div className="me">
          {profile.avatar_url && <img src={profile.avatar_url} alt="" />}
          <span>{profile.name}</span>
          <button onClick={logout}>Abmelden</button>
        </div>
      </header>
      {route === '/decks' ? (
        <DecksPage />
      ) : route === '/stats' ? (
        <StatsPage />
      ) : route === '/mine' ? (
        <MyCardsPage />
      ) : route === '/history' ? (
        <HistoryPage />
      ) : route === '/sets' ? (
        <SetsPage role={profile.role} />
      ) : route === '/players' && profile.role === 'admin' ? (
        <PlayersPage me={profile} />
      ) : (
        <CubePage role={profile.role} />
      )}
    </>
  )
}
