from pydantic import BaseModel, Field
from typing import Optional


class CurveShiftInput(BaseModel):
    commodity: str = Field(description="Commodity to shift: Brent, WTI, Urals, Ethane, HH")
    prompt_shift: float = Field(default=0.0, description="Dollar shift on front month")
    back_end_flat: bool = Field(default=True, description="Keep back end of curve flat")
    vessel_delay_days: Optional[float] = Field(default=0.0, description="Days of vessel delay to apply")
    scenario_name: Optional[str] = Field(default="Custom scenario")


CURVE_SHIFT_TOOL = {
    "name": "curve_shift",
    "description": "Extract parameters for a forward curve manipulation scenario",
    "input_schema": {
        "type": "object",
        "properties": {
            "commodity": {"type": "string", "description": "Commodity name: Brent, WTI, Urals, Ethane, HH, EUA"},
            "prompt_shift": {"type": "number", "description": "Dollar amount to shift the front month price"},
            "back_end_flat": {"type": "boolean", "description": "Whether to keep the back end of the curve unchanged"},
            "vessel_delay_days": {"type": "number", "description": "Number of days of vessel delay"},
            "scenario_name": {"type": "string", "description": "Name for this scenario"}
        },
        "required": ["commodity", "prompt_shift"]
    }
}
