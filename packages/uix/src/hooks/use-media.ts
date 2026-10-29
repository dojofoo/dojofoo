import { useState, useEffect } from "react"

export function useMedia(query: string): boolean {
  // False until mounted, as on the server, so hydration matches; the real value right after
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const matchMedia = window.matchMedia(query)

    const handleChange = () => setMatches(matchMedia.matches)
    handleChange()

    matchMedia.addEventListener("change", handleChange)

    return () => {
      matchMedia.removeEventListener("change", handleChange)
    }
  }, [query])

  return matches
}