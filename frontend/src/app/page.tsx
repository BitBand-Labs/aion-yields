'use client'

import React, { useState } from 'react'
import { TabNavigation } from '@/components/TabNavigation'
import { ClaimTab } from '@/components/tabs/ClaimTab'
import { LeaderboardTab } from '@/components/tabs/LeaderboardTab'
import { ProfileTab } from '@/components/tabs/ProfileTab'
import { HistoryTab } from '@/components/tabs/HistoryTab'

type Tab = 'claim' | 'leaderboard' | 'history' | 'profile'

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('claim')

  const renderContent = () => {
    switch (activeTab) {
      case 'claim':
        return <ClaimTab />
      case 'leaderboard':
        return <LeaderboardTab />
      case 'history':
        return <HistoryTab />
      case 'profile':
        return <ProfileTab />
      default:
        return <ClaimTab />
    }
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-80px)] p-4 pb-32">
      <div className="flex-1 w-full max-w-md mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
        {renderContent()}
      </div>
      
      <TabNavigation activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  )
}
