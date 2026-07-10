import React, { useState } from "react";
import { 
  MessageSquare, 
  Rss, 
  User, 
  Bell, 
  Search, 
  Hash, 
  Pin, 
  MoreVertical, 
  Smile, 
  Paperclip, 
  Mic, 
  Send,
  Phone,
  Video,
  Info,
  ChevronRight,
  ChevronDown,
  Settings,
  Image as ImageIcon,
  FileText,
  Link2,
  Check,
  CheckCheck,
  Command
} from "lucide-react";

export function CommandCenter() {
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("chats");

  // Mock Data
  const pinnedChats = [
    { id: 1, name: "Design Team", type: "group", unread: 3, avatar: "https://i.pravatar.cc/150?img=1" },
    { id: 2, name: "Alex Chen", type: "dm", status: "online", typing: true, avatar: "https://i.pravatar.cc/150?img=11" },
  ];

  const directMessages = [
    { id: 3, name: "Sarah Miller", type: "dm", status: "offline", unread: 0, lastMessage: "Looks good to me!", time: "2h", avatar: "https://i.pravatar.cc/150?img=5" },
    { id: 4, name: "James Wilson", type: "dm", status: "online", unread: 1, lastMessage: "Can we sync later?", time: "4h", avatar: "https://i.pravatar.cc/150?img=12" },
    { id: 5, name: "Maria Garcia", type: "dm", status: "dnd", unread: 0, lastMessage: "Thanks!", time: "1d", avatar: "https://i.pravatar.cc/150?img=9" },
  ];

  const groups = [
    { id: 6, name: "Engineering", type: "group", unread: 0, lastMessage: "Deploy successful", time: "10:30 AM", avatar: "https://i.pravatar.cc/150?img=33" },
    { id: 7, name: "Marketing Sync", type: "group", unread: 12, lastMessage: "Review the new assets", time: "Yesterday", avatar: "https://i.pravatar.cc/150?img=24" },
    { id: 8, name: "Watercooler", type: "group", unread: 0, lastMessage: "Anyone want coffee?", time: "Mon", avatar: "https://i.pravatar.cc/150?img=42" },
  ];

  const messages = [
    { id: 1, sender: "Alex Chen", avatar: "https://i.pravatar.cc/150?img=11", time: "10:15 AM", text: "Hey! Did you get a chance to look at the new dashboard mockups?", isMe: false, read: true },
    { id: 2, sender: "Me", avatar: "https://i.pravatar.cc/150?img=68", time: "10:22 AM", text: "Just reviewed them. The layout looks much better, but I think we need to tweak the spacing on the left rail.", isMe: true, read: true },
    { id: 3, sender: "Alex Chen", avatar: "https://i.pravatar.cc/150?img=11", time: "10:24 AM", text: "Agreed. I'll make it a bit more compact.", isMe: false, read: true },
    { id: 4, sender: "Alex Chen", avatar: "https://i.pravatar.cc/150?img=11", time: "10:25 AM", text: "Here is the updated version with the new spacing applied.", isMe: false, hasAttachment: true, read: true, reactions: ["👍"] },
    { id: 5, sender: "Me", avatar: "https://i.pravatar.cc/150?img=68", time: "10:30 AM", text: "Much better! Let's ship it.", isMe: true, read: false, edited: true },
  ];

  const threadMembers = [
    { id: 1, name: "Alex Chen", role: "Product Designer", status: "online", avatar: "https://i.pravatar.cc/150?img=11" },
    { id: 2, name: "Me", role: "Engineer", status: "online", avatar: "https://i.pravatar.cc/150?img=68" },
  ];

  return (
    <div className="flex h-screen w-full bg-[#0f0f0f] text-gray-200 font-sans overflow-hidden">
      
      {/* 1. Far-left Slim Icon Rail */}
      <div className="w-16 flex flex-col items-center py-4 bg-[#141414] border-r border-[#2a2a2a] z-10">
        {/* Brand / Logo */}
        <div className="w-10 h-10 rounded-xl bg-[#1f95ff]/10 flex items-center justify-center mb-6 cursor-pointer hover:bg-[#1f95ff]/20 transition-colors">
          <MessageSquare className="w-6 h-6 text-[#1f95ff]" fill="currentColor" />
        </div>

        {/* Primary Nav */}
        <div className="flex flex-col space-y-3 flex-1">
          <NavItem icon={<MessageSquare />} active={activeTab === "chats"} onClick={() => setActiveTab("chats")} tooltip="Chats" badge={4} />
          <NavItem icon={<Rss />} active={activeTab === "feed"} onClick={() => setActiveTab("feed")} tooltip="Feed" />
          <NavItem icon={<Bell />} active={activeTab === "notifications"} onClick={() => setActiveTab("notifications")} tooltip="Notifications" badge={1} />
          <NavItem icon={<User />} active={activeTab === "profile"} onClick={() => setActiveTab("profile")} tooltip="Profile" />
        </div>

        {/* Bottom Nav */}
        <div className="flex flex-col space-y-4 items-center">
          <div className="w-8 h-8 rounded-full border-2 border-[#d4a853] p-[2px] cursor-pointer hover:scale-105 transition-transform">
            <img src="https://i.pravatar.cc/150?img=68" alt="My Profile" className="w-full h-full rounded-full object-cover" />
          </div>
          <button className="text-gray-500 hover:text-gray-300 transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. Chat List Column */}
      <div className="w-[280px] flex flex-col bg-[#1a1a1a] border-r border-[#2a2a2a]">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-[#2a2a2a]">
          <h2 className="font-semibold text-white tracking-wide">Chats</h2>
          <button className="text-gray-400 hover:text-white transition-colors">
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-6">
          
          {/* Pinned Section */}
          <div>
            <div className="flex items-center text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">
              <ChevronDown className="w-3 h-3 mr-1" /> Pinned
            </div>
            <div className="space-y-1">
              {pinnedChats.map(chat => (
                <ChatItem key={chat.id} chat={chat} isPinned />
              ))}
            </div>
          </div>

          {/* DMs Section */}
          <div>
            <div className="flex items-center text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">
              <ChevronDown className="w-3 h-3 mr-1" /> Direct Messages
            </div>
            <div className="space-y-1">
              {directMessages.map(chat => (
                <ChatItem key={chat.id} chat={chat} />
              ))}
            </div>
          </div>

          {/* Groups Section */}
          <div>
            <div className="flex items-center text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">
              <ChevronDown className="w-3 h-3 mr-1" /> Groups
            </div>
            <div className="space-y-1">
              {groups.map(chat => (
                <ChatItem key={chat.id} chat={chat} />
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* 3. Main Thread Pane */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0f0f0f]">
        
        {/* Top Command Bar & Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-[#2a2a2a] bg-[#141414]">
          {/* Active Chat Info */}
          <div className="flex items-center space-x-3">
            <div className="relative">
              <img src="https://i.pravatar.cc/150?img=11" alt="Alex Chen" className="w-8 h-8 rounded-full object-cover" />
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#141414]"></div>
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Alex Chen</h3>
              <p className="text-xs text-[#1f95ff] flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1f95ff] mr-1.5 animate-pulse"></span> Typing...
              </p>
            </div>
          </div>

          {/* Global Search / Command Input */}
          <div className="flex-1 max-w-lg mx-6">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-500 group-hover:text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search or jump to..."
                className="block w-full pl-9 pr-12 py-1.5 border border-[#2a2a2a] rounded-md leading-5 bg-[#1a1a1a] text-gray-300 placeholder-gray-500 focus:outline-none focus:bg-[#222] focus:border-[#333] transition-colors sm:text-sm"
              />
              <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-gray-500 text-xs gap-1">
                <Command className="w-3 h-3" /> K
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-2 text-gray-400">
            <button className="p-1.5 rounded-md hover:bg-[#2a2a2a] hover:text-white transition-colors">
              <Phone className="w-4 h-4" />
            </button>
            <button className="p-1.5 rounded-md hover:bg-[#2a2a2a] hover:text-white transition-colors">
              <Video className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-[#2a2a2a] mx-1"></div>
            <button 
              className={`p-1.5 rounded-md transition-colors ${rightPanelOpen ? 'bg-[#2a2a2a] text-white' : 'hover:bg-[#2a2a2a] hover:text-white'}`}
              onClick={() => setRightPanelOpen(!rightPanelOpen)}
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="text-center text-xs text-gray-600 my-4 border-b border-[#2a2a2a] relative">
            <span className="bg-[#0f0f0f] px-2 relative top-2">Today, Oct 24</span>
          </div>
          
          {messages.map(msg => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          
          {/* Typing Indicator */}
          <div className="flex items-start space-x-3 opacity-70">
            <img src="https://i.pravatar.cc/150?img=11" alt="Alex" className="w-8 h-8 rounded-full object-cover mt-0.5" />
            <div className="bg-[#1a1a1a] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center space-x-1">
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 bg-[#0f0f0f]">
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden focus-within:border-[#1f95ff]/50 focus-within:ring-1 focus-within:ring-[#1f95ff]/50 transition-all">
            <textarea 
              className="w-full bg-transparent text-gray-200 p-3 outline-none resize-none min-h-[80px] max-h-[200px] text-sm"
              placeholder="Message @Alex Chen..."
              defaultValue=""
            ></textarea>
            <div className="flex items-center justify-between px-3 py-2 bg-[#141414] border-t border-[#2a2a2a]">
              <div className="flex items-center space-x-1 text-gray-400">
                <button className="p-1.5 hover:text-white hover:bg-[#2a2a2a] rounded-md transition-colors"><Paperclip className="w-4 h-4" /></button>
                <button className="p-1.5 hover:text-white hover:bg-[#2a2a2a] rounded-md transition-colors"><Mic className="w-4 h-4" /></button>
                <button className="p-1.5 hover:text-white hover:bg-[#2a2a2a] rounded-md transition-colors"><Smile className="w-4 h-4" /></button>
              </div>
              <button className="bg-[#1f95ff] hover:bg-[#1a7fd4] text-white p-1.5 rounded-md flex items-center justify-center transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* 4. Right Contextual Panel */}
      {rightPanelOpen && (
        <div className="w-80 bg-[#1a1a1a] border-l border-[#2a2a2a] flex flex-col">
          {/* Header */}
          <div className="h-14 flex items-center px-4 border-b border-[#2a2a2a]">
            <h2 className="font-semibold text-white">Details</h2>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* Profile Summary */}
            <div className="p-6 flex flex-col items-center border-b border-[#2a2a2a]">
              <div className="relative mb-3">
                <img src="https://i.pravatar.cc/150?img=11" alt="Alex Chen" className="w-20 h-20 rounded-full object-cover border-2 border-[#1a1a1a]" />
                <div className="absolute bottom-1 right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-[#1a1a1a]"></div>
              </div>
              <h3 className="text-lg font-semibold text-white">Alex Chen</h3>
              <p className="text-sm text-gray-400">Product Designer</p>
              <div className="flex items-center mt-3 space-x-2">
                <button className="flex-1 bg-[#2a2a2a] hover:bg-[#333] text-sm py-1.5 px-3 rounded-md transition-colors text-white">Profile</button>
                <button className="flex-1 bg-[#2a2a2a] hover:bg-[#333] text-sm py-1.5 px-3 rounded-md transition-colors text-white">Mute</button>
              </div>
            </div>

            {/* Accordion Sections */}
            <div className="py-2 text-white">
              <PanelSection title="Members" count={2} defaultOpen>
                <div className="space-y-3 pt-2">
                  {threadMembers.map(member => (
                    <div key={member.id} className="flex items-center justify-between group cursor-pointer">
                      <div className="flex items-center space-x-3">
                        <div className="relative">
                          <img src={member.avatar} alt={member.name} className="w-8 h-8 rounded-full object-cover" />
                          <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#1a1a1a] ${member.status === 'online' ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                        </div>
                        <div>
                          <p className="text-sm text-gray-200 font-medium group-hover:text-white">{member.name}</p>
                          <p className="text-xs text-gray-500">{member.role}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </PanelSection>

              <PanelSection title="Shared Media" count={12}>
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <div className="aspect-square bg-[#2a2a2a] rounded-md overflow-hidden"><img src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=200&h=200&fit=crop" className="w-full h-full object-cover opacity-80 hover:opacity-100 cursor-pointer" alt="media" /></div>
                  <div className="aspect-square bg-[#2a2a2a] rounded-md overflow-hidden flex items-center justify-center text-gray-500 hover:text-gray-300 cursor-pointer"><FileText className="w-6 h-6" /></div>
                  <div className="aspect-square bg-[#2a2a2a] rounded-md overflow-hidden flex items-center justify-center text-gray-500 hover:text-gray-300 cursor-pointer"><ImageIcon className="w-6 h-6" /></div>
                </div>
              </PanelSection>

              <PanelSection title="Pinned Messages" count={1}>
                <div className="pt-2">
                  <div className="bg-[#2a2a2a] p-3 rounded-lg border border-[#333] hover:border-[#444] cursor-pointer transition-colors">
                    <div className="flex items-center space-x-2 mb-1">
                      <img src="https://i.pravatar.cc/150?img=11" className="w-5 h-5 rounded-full" alt="Alex" />
                      <span className="text-xs font-semibold text-gray-200">Alex Chen</span>
                      <span className="text-[10px] text-gray-500">Oct 23</span>
                    </div>
                    <p className="text-xs text-gray-300 line-clamp-2">"Let's finalize the desktop layout architecture by EOD tomorrow."</p>
                  </div>
                </div>
              </PanelSection>
              
              <PanelSection title="Links" count={4}>
                <div className="space-y-2 pt-2">
                  <div className="flex items-center space-x-3 text-sm text-[#1f95ff] hover:underline cursor-pointer">
                    <Link2 className="w-4 h-4 text-gray-500" />
                    <span className="truncate">figma.com/file/afuchat-desktop</span>
                  </div>
                </div>
              </PanelSection>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS for scrollbars specifically for this component */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #2a2a2a;
          border-radius: 20px;
        }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb {
          background-color: #3a3a3a;
        }
      `}} />
    </div>
  );
}

// Subcomponents

function NavItem({ icon, active, onClick, tooltip, badge }: { icon: React.ReactNode, active: boolean, onClick: () => void, tooltip: string, badge?: number }) {
  return (
    <div className="relative group flex justify-center">
      <div 
        onClick={onClick}
        className={`w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-200 relative
          ${active ? 'bg-[#2a2a2a] text-white shadow-sm' : 'text-gray-500 hover:bg-[#2a2a2a]/50 hover:text-gray-300'}
        `}
      >
        {React.cloneElement(icon as React.ReactElement, { className: "w-5 h-5" })}
        
        {badge && (
          <div className="absolute -top-1 -right-1 bg-[#1f95ff] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center border-2 border-[#141414]">
            {badge}
          </div>
        )}
      </div>
      
      {/* Active Indicator Line */}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#1f95ff] rounded-r-md"></div>
      )}

      {/* Tooltip */}
      <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-[#2a2a2a] text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
        {tooltip}
      </div>
    </div>
  );
}

function ChatItem({ chat, isPinned = false }: { chat: any, isPinned?: boolean }) {
  const active = chat.name === "Alex Chen";
  
  return (
    <div className={`flex items-center px-2 py-2 mx-2 rounded-lg cursor-pointer transition-colors group
      ${active ? 'bg-[#2a2a2a]' : 'hover:bg-[#222]'}
    `}>
      <div className="relative mr-3 flex-shrink-0">
        <img src={chat.avatar} alt={chat.name} className="w-10 h-10 rounded-full object-cover" />
        {chat.type === 'dm' && chat.status && (
          <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#1a1a1a]
            ${chat.status === 'online' ? 'bg-green-500' : chat.status === 'dnd' ? 'bg-red-500' : 'bg-gray-500'}
          `}></div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-0.5">
          <h4 className={`text-sm truncate font-medium ${active ? 'text-white' : 'text-gray-200 group-hover:text-white'}`}>
            {chat.type === 'group' && <Hash className="w-3 h-3 inline mr-1 text-gray-500" />}
            {chat.name}
          </h4>
          {chat.time && <span className="text-[10px] text-gray-500 flex-shrink-0 ml-2">{chat.time}</span>}
        </div>
        
        {chat.typing ? (
          <p className="text-xs text-[#1f95ff] truncate flex items-center">
            Typing...
          </p>
        ) : (
          <p className="text-xs text-gray-400 truncate">
            {chat.lastMessage || "Click to open chat"}
          </p>
        )}
      </div>

      {isPinned && <Pin className="w-3 h-3 text-gray-500 ml-2 rotate-45 opacity-50 group-hover:opacity-100 transition-opacity" />}
      
      {chat.unread > 0 && (
        <div className="ml-2 bg-[#1f95ff] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {chat.unread}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: any }) {
  return (
    <div className={`flex items-start space-x-3 group ${msg.isMe ? 'flex-row-reverse space-x-reverse' : ''}`}>
      {!msg.isMe && (
        <img src={msg.avatar} alt={msg.sender} className="w-8 h-8 rounded-full object-cover mt-0.5 flex-shrink-0 cursor-pointer" />
      )}
      
      <div className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'} max-w-[70%]`}>
        <div className="flex items-baseline space-x-2 mb-1 mx-1">
          {!msg.isMe && <span className="text-sm font-semibold text-gray-200">{msg.sender}</span>}
          <span className="text-xs text-gray-500">{msg.time}</span>
        </div>
        
        <div className="relative group/msg">
          <div className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap shadow-sm
            ${msg.isMe 
              ? 'bg-[#1f95ff] text-white rounded-tr-sm' 
              : 'bg-[#1a1a1a] border border-[#2a2a2a] text-gray-200 rounded-tl-sm'
            }
          `}>
            {msg.text}
            
            {msg.hasAttachment && (
              <div className="mt-3 rounded-lg overflow-hidden border border-black/20">
                <img src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400&h=250&fit=crop" alt="attachment" className="w-full h-auto object-cover max-w-sm" />
              </div>
            )}
          </div>
          
          {/* Read Receipt */}
          {msg.isMe && (
            <div className="absolute -right-5 bottom-1 text-gray-500">
              {msg.read ? <CheckCheck className="w-3.5 h-3.5 text-[#1f95ff]" /> : <Check className="w-3.5 h-3.5" />}
            </div>
          )}

          {/* Edited mark */}
          {msg.edited && (
            <span className="text-[10px] text-gray-500 mt-1 block text-right w-full">(edited)</span>
          )}

          {/* Quick Actions (Hover) */}
          <div className={`absolute top-0 -translate-y-1/2 opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center bg-[#2a2a2a] border border-[#333] rounded-lg shadow-lg
            ${msg.isMe ? '-left-24' : '-right-24'}
          `}>
            <button className="p-1.5 text-gray-400 hover:text-white hover:bg-[#333] rounded-l-lg"><Smile className="w-4 h-4" /></button>
            <button className="p-1.5 text-gray-400 hover:text-white hover:bg-[#333]"><MessageSquare className="w-4 h-4" /></button>
            <button className="p-1.5 text-gray-400 hover:text-white hover:bg-[#333] rounded-r-lg"><MoreVertical className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Reactions */}
        {msg.reactions && msg.reactions.length > 0 && (
          <div className="flex items-center space-x-1 mt-1 mx-1">
            {msg.reactions.map((reaction: string, idx: number) => (
              <div key={idx} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-full px-2 py-0.5 text-xs flex items-center space-x-1 cursor-pointer hover:border-gray-500">
                <span>{reaction}</span>
                <span className="text-gray-400">1</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PanelSection({ title, count, defaultOpen = false, children }: { title: string, count?: number, defaultOpen?: boolean, children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  
  return (
    <div className="border-b border-[#2a2a2a]">
      <button 
        className="w-full flex items-center justify-between p-4 hover:bg-[#222] transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-sm text-gray-200">{title}</span>
          {count !== undefined && <span className="bg-[#2a2a2a] text-gray-400 text-xs px-1.5 rounded-md">{count}</span>}
        </div>
        <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      
      {open && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}
