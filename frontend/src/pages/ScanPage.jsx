// ScanPage — soil scanner and adviser chat on one page, as tabs.
//
// Both features belong to the same user intent: "look at something and get
// advice about it". The soil scanner gives visual observations, the chat
// lets you follow up in words. Tabs keep the page compact and make the
// relationship obvious.
//
// Both underlying components (SoilScanner, AdviserChat) are unchanged from
// the versions that already work.

import { useState } from 'react'
import SoilScanner from '../components/SoilScanner'
import AdviserChat from '../components/AdviserChat'
import Icon from '../components/Icon'

export default function ScanPage({
  // Soil scanner props
  scanFile,
  scanPreview,
  scanResult,
  scanLoading,
  scanError,
  onSelectFile,
  onScan,
  onRemove,
  // Chat props
  messages,
  messageInput,
  chatLoading,
  chatError,
  onInputChange,
  onSend,
  onPresetQuestion,
}) {
  const [activeTab, setActiveTab] = useState('scan')  // 'scan' or 'chat'

  return (
    <main>
      <div className="container scan-page">
        <div className="scan-tabs card">
          <div className="scan-tabs-header" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === 'scan'}
              className={'scan-tab' + (activeTab === 'scan' ? ' active' : '')}
              onClick={() => setActiveTab('scan')}
            >
              <Icon name="camera" size={17} />
              Soil scan
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'chat'}
              className={'scan-tab' + (activeTab === 'chat' ? ' active' : '')}
              onClick={() => setActiveTab('chat')}
            >
              <Icon name="chat" size={17} />
              Ask Nuru
            </button>
          </div>

          <div className="scan-tabs-body">
            {activeTab === 'scan' ? (
              <SoilScanner
                scanFile={scanFile}
                scanPreview={scanPreview}
                scanResult={scanResult}
                scanLoading={scanLoading}
                scanError={scanError}
                onSelectFile={onSelectFile}
                onScan={onScan}
                onRemove={onRemove}
              />
            ) : (
              <AdviserChat
                messages={messages}
                messageInput={messageInput}
                chatLoading={chatLoading}
                chatError={chatError}
                onInputChange={onInputChange}
                onSend={onSend}
                onPresetQuestion={onPresetQuestion}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}