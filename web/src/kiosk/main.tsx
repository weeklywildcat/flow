import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@fontsource-variable/figtree"
import "../index.css"
import "./kiosk.css"
import { Kiosk } from "./kiosk"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Kiosk />
  </StrictMode>
)
