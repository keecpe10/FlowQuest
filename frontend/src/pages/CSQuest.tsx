import {useCallback, useState} from 'react';
import {createPortal} from 'react-dom';
import {useNavigate} from 'react-router-dom';
import Adventure from '../features/csquest/App.jsx';
import {NotificationHost} from '../features/csquest/components/Notifications.jsx';
import {PortalContext} from '../features/csquest/portal.js';
import spotlightStyles from '../features/csquest/components/SpotlightCard.css?inline';
import styles from '../features/csquest/styles.css?inline';

export default function CSQuest() {
  const navigate=useNavigate();
  const [root,setRoot]=useState<ShadowRoot|null>(null);
  const attach=useCallback((element: HTMLDivElement|null)=>{
    if(element) setRoot(element.shadowRoot || element.attachShadow({mode:'open'}));
  },[]);
  return <div ref={attach} style={{minHeight:'100vh'}}>{root && createPortal(
    <PortalContext.Provider value={root}>
      <style>{styles + spotlightStyles}</style>
      <NotificationHost><Adventure onExit={()=>navigate('/')} /></NotificationHost>
    </PortalContext.Provider>,root)}</div>;
}
