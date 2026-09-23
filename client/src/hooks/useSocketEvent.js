import { useEffect, useRef } from 'react';
import { onSocketCreated } from '../services/socket.js';

/** Subscribe to a socket event for the lifetime of the component. */
export function useSocketEvent(event, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    let detach = null;
    const unsubscribe = onSocketCreated((socket) => {
      const fn = (...args) => ref.current?.(...args);
      socket.on(event, fn);
      detach = () => socket.off(event, fn);
    });
    return () => {
      unsubscribe();
      if (detach) detach();
    };
  }, [event]);
}
