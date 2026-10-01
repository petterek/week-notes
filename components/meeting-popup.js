const STORAGE_KEY = 'meeting-popup-size';

function validSize(size) {
    return size && Number.isInteger(size.width) && size.width > 0
        && Number.isInteger(size.height) && size.height > 0;
}

export function meetingPopupFeatures(defaultWidth, defaultHeight) {
    let size;
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            size = JSON.parse(saved);
            if (!validSize(size)) throw new Error('Invalid meeting popup size');
        }
    } catch (error) {
        console.warn('Could not restore meeting popup size:', error);
    }
    return `popup=yes,width=${size ? size.width : defaultWidth},height=${size ? size.height : defaultHeight},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no`;
}

let listening = false;

export function rememberMeetingPopupSize() {
    if (listening || new URLSearchParams(location.search).get('popup') !== '1') return;
    listening = true;
    const save = () => {
        const size = { width: window.outerWidth, height: window.outerHeight };
        if (!validSize(size)) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(size));
        } catch (error) {
            console.error('Could not save meeting popup size:', error);
        }
    };
    window.addEventListener('resize', save);
    window.addEventListener('pagehide', save);
}
