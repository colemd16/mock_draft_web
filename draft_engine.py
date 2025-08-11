# draft_engine.py
import csv

COLOR = {"QB":"red","RB":"green","WR":"yellow","TE":"purple","K":"orange","D/ST":"white"}

class DraftGame:
    def __init__(self, players_csv="players2.csv"):
        self.players_csv = players_csv
        self.players_all = self._load_players()
        self.reset(slot=4, teams=12, rounds=20)

    def _load_players(self):
        with open(self.players_csv, newline="") as f:
            r = csv.DictReader(f)
            players = [
                {
                    "name": row["player_name"],
                    "position": row["position"],
                    "team": row["team"],
                    "bye": row["bye_week"],
                    "overall": int(row["overall"]),
                }
                for row in r if row["overall"].isdigit()
            ]
        players.sort(key=lambda x: x["overall"])
        return players

    def reset(self, slot=4, teams=12, rounds=20):
        self.slot = slot
        self.teams = teams
        self.rounds = rounds
        self.team_names = [f"Team{i+1}" for i in range(teams)]
        self.team_names[slot-1] = "You"
        self.board = {t: [] for t in self.team_names}
        self.pool = list(self.players_all)  # fresh copy
        self.pick_ptr = 0                   # 0..(teams*rounds-1)
        # precompute snake order
        self.order = []
        for r in range(rounds):
            line = list(range(teams))
            if r % 2: line.reverse()
            self.order += line

    def _current_round(self):
        return self.pick_ptr // self.teams + 1

    def _current_team(self):
        return self.team_names[self.order[self.pick_ptr]]

    def _cpu_index(self, team):
        """Mirror CLI logic: sample an index from a Gaussian around 0 (σ=3),
        try up to 30 times to respect the early QB rule, then fallback to best available.
        Early QB rule: before the team's 9th pick (first 8 rounds), allow at most 1 QB.
        """
        # How many picks this specific team has already made
        current_round_team = len(self.board[team])
        qb_count = sum(1 for p in self.board[team] if p["position"] == "QB")

        # Try up to 30 candidates to satisfy constraints
        import random
        for _ in range(30):
            # Draw an index biased toward the top of the pool
            idx = max(0, min(len(self.pool) - 1, round(random.gauss(0, 3))))
            cand = self.pool[idx]
            # Before the team's 9th pick, only allow 1 QB total
            if current_round_team < 8 and cand["position"] == "QB" and qb_count >= 1:
                continue
            return idx

        # Fallback: first eligible by scan with the same rule
        for i, cand in enumerate(self.pool):
            if current_round_team < 8 and cand["position"] == "QB" and qb_count >= 1:
                continue
            return i
        return 0

    def advance_to_user_turn(self):
        while self.pick_ptr < self.teams*self.rounds and self._current_team() != "You":
            team = self._current_team()
            idx = self._cpu_index(team)
            pick = self.pool.pop(idx)
            self.board[team].append(pick)
            self.pick_ptr += 1

    def user_pick_by_index(self, top_index):
        # top-20 view comes from pool[:20]
        pick = self.pool.pop(top_index)
        self.board["You"].append(pick)
        self.pick_ptr += 1

    def top20(self):
        # name + (pos, bye) for UI list
        return [
            {
                "name": p["name"],
                "pos": p["position"],
                "bye": p["bye"],
                "color": COLOR.get(p["position"], "white")
            }
            for p in self.pool[:20]
        ]

    def board_rows(self):
        # one board (teams as columns), names only (no pos/bye)
        rounds = max(len(v) for v in self.board.values()) if self.board else 0
        rows = []
        for r in range(rounds):
            row = []
            for t in self.team_names:
                if r < len(self.board[t]):
                    row.append(self.board[t][r]["name"])
                else:
                    row.append("")
            rows.append(row)
        return rows

    def state(self):
        return {
            "round": self._current_round(),
            "teams": self.team_names,
            "board": self.board_rows(),
            "top20": self.top20(),
            "your_roster": self.board["You"],  # you can render slots client-side
            "on_the_clock": self._current_team(),
        }