"""Saving vital-sign readings (TS-08). record_reading is the only place that creates vital_signs rows; US-03 extends it to score the reading. See specs/008-vital-signs-simulator/contracts/commands.md §3."""

from app.models import VitalSign
from app.scoring import PARAMETERS, VitalSigns, validate_vital_signs


def record_reading(session, patient_id: int, vitals: VitalSigns) -> VitalSign:
    """Validate ``vitals``, add one vital_signs row for ``patient_id`` and flush it.

    Invalid values raise ``InvalidVitalSigns`` before anything is added to the
    session. The returned row has its ``id``. This function does not commit:
    the caller commits or rolls back.
    """
    validate_vital_signs(vitals)
    row = VitalSign(
        patient_id=patient_id, **{name: getattr(vitals, name) for name in PARAMETERS}
    )
    session.add(row)
    session.flush()
    return row
