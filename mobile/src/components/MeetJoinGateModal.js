import React from 'react';
import { AppDialog } from './AppDialog';

/**
 * Styled gate when Join Google Meet is tapped outside the 1-hour window.
 */
export const MeetJoinGateModal = ({
  visible,
  onClose,
  title,
  message,
  meetingTimeLabel,
  opensAtLabel,
  ended = false,
}) => {
  const details = [];
  if (!ended && meetingTimeLabel) {
    details.push({ label: 'Appointment', value: meetingTimeLabel });
  }
  if (!ended && opensAtLabel) {
    details.push({ label: 'Join opens', value: opensAtLabel, accent: true });
  }

  return (
    <AppDialog
      visible={visible}
      onClose={onClose}
      variant={ended ? 'error' : 'info'}
      icon={ended ? 'time-outline' : 'videocam-outline'}
      title={title || (ended ? 'Meeting ended' : 'Not available yet')}
      message={
        message ||
        (ended
          ? 'This Google Meet session has ended.'
          : 'You can join Google Meet starting 1 hour before your appointment.')
      }
      details={details}
      primaryLabel="Got it"
      onPrimary={onClose}
      dismissOnBackdrop
    />
  );
};
