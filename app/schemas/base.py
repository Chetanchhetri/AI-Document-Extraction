from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    model_config = ConfigDict(
        extra="ignore",          # Silently ignore unexpected UI state keys instead of 422 error
        populate_by_name=True,   # Support both field names and aliases
        from_attributes=True     # ORM compatibility
    )