import React from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  return (
    <div style={{fontFamily: 'Arial, sans-serif', padding: 24}}>
      <h1>Manufacturing Platform — Client</h1>
      <p>Welcome — client scaffolded.</p>
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
