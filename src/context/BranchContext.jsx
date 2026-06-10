import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const BranchContext = createContext(null)

const STORAGE_KEY = 'ugs_branch_slug'

export function BranchProvider({ children }) {
  const [branches,       setBranches]       = useState([])
  const [currentBranch,  setCurrentBranch]  = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [showSelector,   setShowSelector]   = useState(false)

  const fetchBranches = useCallback(async () => {
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    return data ?? []
  }, [])

  useEffect(() => {
    async function init() {
      const data = await fetchBranches()
      setBranches(data)

      // 1. Check URL param  ?branch=slug
      const params  = new URLSearchParams(window.location.search)
      const urlSlug = params.get('branch')

      // 2. Check localStorage
      const savedSlug = localStorage.getItem(STORAGE_KEY)

      const slug = urlSlug || savedSlug
      const matched = data.find(b => b.slug === slug)

      if (matched) {
        setCurrentBranch(matched)
        localStorage.setItem(STORAGE_KEY, matched.slug)
        setShowSelector(false)
      } else if (data.length === 1) {
        // Only one branch — auto-select it
        setCurrentBranch(data[0])
        localStorage.setItem(STORAGE_KEY, data[0].slug)
        setShowSelector(false)
      } else {
        setShowSelector(true)
      }

      setLoading(false)
    }
    init()
  }, [fetchBranches])

  function selectBranch(branch) {
    setCurrentBranch(branch)
    localStorage.setItem(STORAGE_KEY, branch.slug)
    setShowSelector(false)
  }

  function switchBranch() {
    setShowSelector(true)
  }

  return (
    <BranchContext.Provider value={{
      branches,
      currentBranch,
      loading,
      showSelector,
      selectBranch,
      switchBranch,
    }}>
      {children}
    </BranchContext.Provider>
  )
}

export function useBranch() {
  const ctx = useContext(BranchContext)
  if (!ctx) throw new Error('useBranch must be used inside BranchProvider')
  return ctx
}
