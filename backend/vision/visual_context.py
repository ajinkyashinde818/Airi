from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


@dataclass
class VisualPerson:
    count: int | None = None
    position: str | None = None
    visible: bool | None = None


@dataclass
class VisualScene:
    description: str | None = None
    environment: str | None = None


@dataclass
class VisualChange:
    description: str
    timestamp: str
    expires_at: str


@dataclass
class VisualContext:
    scene: VisualScene = field(default_factory=VisualScene)
    people: list[VisualPerson] = field(default_factory=list)
    objects: list[str] = field(default_factory=list)
    activities: list[str] = field(default_factory=list)
    recent_changes: list[str] = field(default_factory=list)
    last_updated: str | None = None
    confidence: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class VisualContextStore:
    def __init__(
        self,
        change_ttl_seconds: int | None = None,
    ) -> None:
        ttl_seconds = change_ttl_seconds

        if ttl_seconds is None:
            ttl_seconds = int(
                os.getenv(
                    "AIRI_VISUAL_CHANGE_TTL_SECONDS",
                    "300",
                )
            )

        self.change_ttl = timedelta(seconds=ttl_seconds)
        self.context = VisualContext()
        self._changes: list[VisualChange] = []

    def get_context(self) -> dict[str, Any]:
        self._expire_changes()
        self.context.recent_changes = [
            change.description
            for change in self._changes
        ]

        return self.context.to_dict()

    def update(
        self,
        analysis: dict[str, Any],
    ) -> dict[str, Any]:
        previous = self.context

        scene = self._normalize_scene(
            analysis.get("scene"),
            analysis.get("description"),
        )
        people = self._normalize_people(
            analysis.get("people")
        )
        objects = self._normalize_string_list(
            analysis.get("objects")
        )
        activities = self._normalize_string_list(
            analysis.get("activities")
            or analysis.get("activity")
        )
        confidence = self._normalize_confidence(
            analysis.get("confidence")
        )

        detected_changes = self._detect_changes(
            previous,
            scene,
            people,
            objects,
            activities,
        )
        detected_changes.extend(
            self._normalize_string_list(
                analysis.get("changes")
            )
        )

        self._record_changes(
            detected_changes
        )

        self.context = VisualContext(
            scene=scene,
            people=people,
            objects=objects,
            activities=activities,
            recent_changes=[
                change.description
                for change in self._changes
            ],
            last_updated=analysis.get("timestamp") or iso_now(),
            confidence=confidence,
        )

        return self.get_context()

    def _record_changes(
        self,
        changes: list[str],
    ) -> None:
        self._expire_changes()

        now = utc_now()
        expires_at = now + self.change_ttl
        existing = {
            change.description.lower()
            for change in self._changes
        }

        for change in changes:
            cleaned = change.strip()

            if not cleaned:
                continue

            key = cleaned.lower()

            if key in existing:
                continue

            self._changes.append(
                VisualChange(
                    description=cleaned,
                    timestamp=now.isoformat(),
                    expires_at=expires_at.isoformat(),
                )
            )
            existing.add(key)

    def _expire_changes(self) -> None:
        now = utc_now()
        self._changes = [
            change
            for change in self._changes
            if datetime.fromisoformat(change.expires_at) > now
        ]

    def _detect_changes(
        self,
        previous: VisualContext,
        scene: VisualScene,
        people: list[VisualPerson],
        objects: list[str],
        activities: list[str],
    ) -> list[str]:
        changes: list[str] = []

        previous_people = self._total_people(previous.people)
        current_people = self._total_people(people)

        if previous.last_updated is not None:
            if current_people > previous_people:
                changes.append(
                    "another person appeared"
                    if previous_people > 0
                    else "person appeared"
                )
            elif current_people < previous_people:
                changes.append(
                    "person disappeared"
                )

        previous_objects = set(previous.objects)
        current_objects = set(objects)

        for item in sorted(current_objects - previous_objects):
            if previous.last_updated is not None:
                changes.append(f"{item} appeared")

        for item in sorted(previous_objects - current_objects):
            changes.append(f"{item} disappeared")

        if (
            previous.last_updated is not None
            and previous.scene.environment
            and scene.environment
            and previous.scene.environment != scene.environment
        ):
            changes.append(
                f"environment changed to {scene.environment}"
            )

        previous_activities = set(previous.activities)
        current_activities = set(activities)

        if (
            previous.last_updated is not None
            and previous_activities
            and current_activities
            and previous_activities != current_activities
        ):
            changes.append("activity changed")

        return changes

    def _total_people(
        self,
        people: list[VisualPerson],
    ) -> int:
        total = 0

        for person in people:
            if person.visible is False:
                continue

            total += person.count or 1

        return total

    def _normalize_scene(
        self,
        value: Any,
        fallback_description: Any,
    ) -> VisualScene:
        if isinstance(value, dict):
            return VisualScene(
                description=self._clean_optional_string(
                    value.get("description")
                )
                or self._clean_optional_string(
                    fallback_description
                ),
                environment=self._clean_optional_string(
                    value.get("environment")
                ),
            )

        return VisualScene(
            description=self._clean_optional_string(
                fallback_description
            ),
            environment=None,
        )

    def _normalize_people(
        self,
        value: Any,
    ) -> list[VisualPerson]:
        if not isinstance(value, list):
            return []

        people: list[VisualPerson] = []

        for item in value:
            if not isinstance(item, dict):
                continue

            people.append(
                VisualPerson(
                    count=self._normalize_int(
                        item.get("count")
                    ),
                    position=self._clean_optional_string(
                        item.get("position")
                    ),
                    visible=self._normalize_bool(
                        item.get("visible")
                    ),
                )
            )

        return people

    def _normalize_string_list(
        self,
        value: Any,
    ) -> list[str]:
        if not isinstance(value, list):
            return []

        cleaned: list[str] = []
        seen: set[str] = set()

        for item in value:
            text = self._clean_optional_string(item)

            if not text:
                continue

            key = text.lower()

            if key in seen:
                continue

            cleaned.append(text)
            seen.add(key)

        return cleaned

    def _normalize_confidence(
        self,
        value: Any,
    ) -> float | None:
        if value is None:
            return None

        try:
            confidence = float(value)
        except (TypeError, ValueError):
            return None

        return max(0.0, min(confidence, 1.0))

    def _normalize_int(
        self,
        value: Any,
    ) -> int | None:
        if value is None:
            return None

        try:
            number = int(value)
        except (TypeError, ValueError):
            return None

        return max(0, number)

    def _normalize_bool(
        self,
        value: Any,
    ) -> bool | None:
        if isinstance(value, bool):
            return value

        return None

    def _clean_optional_string(
        self,
        value: Any,
    ) -> str | None:
        if not isinstance(value, str):
            return None

        cleaned = value.strip()

        return cleaned or None


visual_context_store = VisualContextStore()
