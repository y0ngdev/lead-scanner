package scanner

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"

	"encore.dev/rlog"
)

// Application represents a tracked job application in the pipeline.
type Application struct {
	ID           int64     `json:"id"`
	LeadID       *int64    `json:"lead_id,omitempty"`
	Company      string    `json:"company"`
	Role         string    `json:"role"`
	JobURL       string    `json:"job_url"`
	Source       string    `json:"source"`
	Status       string    `json:"status"` // wishlist, applied, screening, interviewing, offer, rejected, withdrawn
	AppliedDate  *string   `json:"applied_date,omitempty"`
	Salary       string    `json:"salary"`
	Location     string    `json:"location"`
	ContactName  string    `json:"contact_name"`
	ContactEmail string    `json:"contact_email"`
	Notes        string    `json:"notes"`
	NextStep     string    `json:"next_step"`
	NextStepDate *string   `json:"next_step_date,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// ListApplicationsParams defines filters for listing applications.
type ListApplicationsParams struct {
	Status string `query:"status"` // filter by status; empty means all
	Search string `query:"search"` // search company, role, or notes
	Limit  int    `query:"limit"`
	Offset int    `query:"offset"`
}

// ListApplicationsResponse wraps the returned applications.
type ListApplicationsResponse struct {
	Applications []Application `json:"applications"`
	Total        int           `json:"total"`
}

// ApplicationStats summarizes application metrics across stages.
type ApplicationStats struct {
	Total        int     `json:"total"`
	Wishlist     int     `json:"wishlist"`
	Applied      int     `json:"applied"`
	Screening    int     `json:"screening"`
	Interviewing int     `json:"interviewing"`
	Offer        int     `json:"offer"`
	Rejected     int     `json:"rejected"`
	Withdrawn    int     `json:"withdrawn"`
	Active       int     `json:"active"`
	ResponseRate float64 `json:"response_rate"`
}

// CreateApplicationParams contains fields to create an application.
type CreateApplicationParams struct {
	LeadID       *int64  `json:"lead_id"`
	Company      string  `json:"company"`
	Role         string  `json:"role"`
	JobURL       string  `json:"job_url"`
	Source       string  `json:"source"`
	Status       string  `json:"status"`
	AppliedDate  *string `json:"applied_date"` // YYYY-MM-DD
	Salary       string  `json:"salary"`
	Location     string  `json:"location"`
	ContactName  string  `json:"contact_name"`
	ContactEmail string  `json:"contact_email"`
	Notes        string  `json:"notes"`
	NextStep     string  `json:"next_step"`
	NextStepDate *string `json:"next_step_date"` // YYYY-MM-DD
}

// UpdateApplicationParams contains fields to update an application.
type UpdateApplicationParams struct {
	Company      *string `json:"company"`
	Role         *string `json:"role"`
	JobURL       *string `json:"job_url"`
	Source       *string `json:"source"`
	Status       *string `json:"status"`
	AppliedDate  *string `json:"applied_date"`
	Salary       *string `json:"salary"`
	Location     *string `json:"location"`
	ContactName  *string `json:"contact_name"`
	ContactEmail *string `json:"contact_email"`
	Notes        *string `json:"notes"`
	NextStep     *string `json:"next_step"`
	NextStepDate *string `json:"next_step_date"`
}

// ListApplications returns all job applications matching filters.
//
//encore:api public method=GET path=/applications
func ListApplications(ctx context.Context, params *ListApplicationsParams) (*ListApplicationsResponse, error) {
	limit := params.Limit
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	offset := params.Offset
	if offset < 0 {
		offset = 0
	}

	whereClauses := []string{"1=1"}
	args := []any{}
	argN := 1

	if params.Status != "" && params.Status != "all" {
		whereClauses = append(whereClauses, fmt.Sprintf("status = $%d", argN))
		args = append(args, params.Status)
		argN++
	}

	if params.Search != "" {
		searchPattern := "%" + strings.ToLower(params.Search) + "%"
		whereClauses = append(whereClauses, fmt.Sprintf("(LOWER(company) LIKE $%d OR LOWER(role) LIKE $%d OR LOWER(notes) LIKE $%d)", argN, argN, argN))
		args = append(args, searchPattern)
		argN++
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	var total int
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM applications WHERE %s", whereSQL)
	if err := db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		rlog.Error("failed counting applications", "err", err)
		return nil, err
	}

	selectQuery := fmt.Sprintf(`
		SELECT id, lead_id, company, role, job_url, source, status,
		       applied_date, salary, location, contact_name, contact_email,
		       notes, next_step, next_step_date, created_at, updated_at
		FROM applications
		WHERE %s
		ORDER BY 
			CASE 
				WHEN next_step_date IS NOT NULL AND next_step_date >= CURRENT_DATE THEN 0
				ELSE 1
			END,
			updated_at DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argN, argN+1)

	args = append(args, limit, offset)

	rows, err := db.Query(ctx, selectQuery, args...)
	if err != nil {
		rlog.Error("failed querying applications", "err", err)
		return nil, err
	}
	defer rows.Close()

	var apps []Application
	for rows.Next() {
		app, err := scanApplication(rows)
		if err != nil {
			rlog.Error("failed scanning application row", "err", err)
			return nil, err
		}
		apps = append(apps, *app)
	}

	return &ListApplicationsResponse{
		Applications: apps,
		Total:        total,
	}, nil
}

// GetApplicationStats returns metrics on the application pipeline.
//
//encore:api public method=GET path=/applications/stats
func GetApplicationStats(ctx context.Context) (*ApplicationStats, error) {
	rows, err := db.Query(ctx, `SELECT status, COUNT(*) FROM applications GROUP BY status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	stats := &ApplicationStats{}
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		stats.Total += count
		switch status {
		case "wishlist":
			stats.Wishlist = count
		case "applied":
			stats.Applied = count
		case "screening":
			stats.Screening = count
		case "interviewing":
			stats.Interviewing = count
		case "offer":
			stats.Offer = count
		case "rejected":
			stats.Rejected = count
		case "withdrawn":
			stats.Withdrawn = count
		}
	}

	stats.Active = stats.Applied + stats.Screening + stats.Interviewing
	responded := stats.Screening + stats.Interviewing + stats.Offer
	considered := responded + stats.Rejected
	if considered > 0 {
		stats.ResponseRate = float64(responded) / float64(considered) * 100.0
	}

	return stats, nil
}

// CreateApplication inserts a new tracked application into the pipeline.
// If created from a Lead, it links the lead and automatically marks it reviewed.
//
//encore:api public method=POST path=/applications
func CreateApplication(ctx context.Context, p *CreateApplicationParams) (*Application, error) {
	if strings.TrimSpace(p.Company) == "" {
		return nil, fmt.Errorf("company name is required")
	}
	if strings.TrimSpace(p.Role) == "" {
		return nil, fmt.Errorf("role/title is required")
	}

	status := strings.ToLower(strings.TrimSpace(p.Status))
	if status == "" {
		status = "applied"
	}
	source := strings.TrimSpace(p.Source)
	if source == "" {
		source = "manual"
	}

	var appliedDateVal *time.Time
	if p.AppliedDate != nil && *p.AppliedDate != "" {
		if t, err := time.Parse("2006-01-02", *p.AppliedDate); err == nil {
			appliedDateVal = &t
		}
	} else if status == "applied" || status == "screening" || status == "interviewing" || status == "offer" {
		now := time.Now().UTC()
		appliedDateVal = &now
	}

	var nextStepDateVal *time.Time
	if p.NextStepDate != nil && *p.NextStepDate != "" {
		if t, err := time.Parse("2006-01-02", *p.NextStepDate); err == nil {
			nextStepDateVal = &t
		}
	}

	var appID int64
	var createdAt, updatedAt time.Time

	err := db.QueryRow(ctx, `
		INSERT INTO applications (
			lead_id, company, role, job_url, source, status,
			applied_date, salary, location, contact_name, contact_email,
			notes, next_step, next_step_date
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, $9, $10, $11,
			$12, $13, $14
		)
		RETURNING id, created_at, updated_at
	`, p.LeadID, p.Company, p.Role, p.JobURL, source, status,
		appliedDateVal, p.Salary, p.Location, p.ContactName, p.ContactEmail,
		p.Notes, p.NextStep, nextStepDateVal,
	).Scan(&appID, &createdAt, &updatedAt)
	if err != nil {
		rlog.Error("failed inserting application", "err", err)
		return nil, err
	}

	// If linked to a lead, automatically mark the lead as reviewed
	if p.LeadID != nil && *p.LeadID > 0 {
		_, err := db.Exec(ctx, `UPDATE leads SET reviewed = true WHERE id = $1`, *p.LeadID)
		if err != nil {
			rlog.Warn("could not mark lead as reviewed after application creation", "lead_id", *p.LeadID, "err", err)
		}
	}

	var appliedDateStr *string
	if appliedDateVal != nil {
		s := appliedDateVal.Format("2006-01-02")
		appliedDateStr = &s
	}
	var nextStepDateStr *string
	if nextStepDateVal != nil {
		s := nextStepDateVal.Format("2006-01-02")
		nextStepDateStr = &s
	}

	return &Application{
		ID:           appID,
		LeadID:       p.LeadID,
		Company:      p.Company,
		Role:         p.Role,
		JobURL:       p.JobURL,
		Source:       source,
		Status:       status,
		AppliedDate:  appliedDateStr,
		Salary:       p.Salary,
		Location:     p.Location,
		ContactName:  p.ContactName,
		ContactEmail: p.ContactEmail,
		Notes:        p.Notes,
		NextStep:     p.NextStep,
		NextStepDate: nextStepDateStr,
		CreatedAt:    createdAt,
		UpdatedAt:    updatedAt,
	}, nil
}

// GetApplication retrieves a single application by ID.
//
//encore:api public method=GET path=/applications/:id
func GetApplication(ctx context.Context, id int64) (*Application, error) {
	row := db.QueryRow(ctx, `
		SELECT id, lead_id, company, role, job_url, source, status,
		       applied_date, salary, location, contact_name, contact_email,
		       notes, next_step, next_step_date, created_at, updated_at
		FROM applications
		WHERE id = $1
	`, id)

	return scanApplication(row)
}

// UpdateApplication updates fields on an existing application.
//
//encore:api public method=PATCH path=/applications/:id
func UpdateApplication(ctx context.Context, id int64, p *UpdateApplicationParams) (*Application, error) {
	setClauses := []string{"updated_at = now()"}
	args := []any{id}
	argN := 2

	if p.Company != nil {
		setClauses = append(setClauses, "company = $"+strconv.Itoa(argN))
		args = append(args, *p.Company)
		argN++
	}
	if p.Role != nil {
		setClauses = append(setClauses, "role = $"+strconv.Itoa(argN))
		args = append(args, *p.Role)
		argN++
	}
	if p.JobURL != nil {
		setClauses = append(setClauses, "job_url = $"+strconv.Itoa(argN))
		args = append(args, *p.JobURL)
		argN++
	}
	if p.Source != nil {
		setClauses = append(setClauses, "source = $"+strconv.Itoa(argN))
		args = append(args, *p.Source)
		argN++
	}
	if p.Status != nil {
		setClauses = append(setClauses, "status = $"+strconv.Itoa(argN))
		args = append(args, strings.ToLower(strings.TrimSpace(*p.Status)))
		argN++
	}
	if p.AppliedDate != nil {
		if *p.AppliedDate == "" {
			setClauses = append(setClauses, "applied_date = NULL")
		} else if t, err := time.Parse("2006-01-02", *p.AppliedDate); err == nil {
			setClauses = append(setClauses, "applied_date = $"+strconv.Itoa(argN))
			args = append(args, t)
			argN++
		}
	}
	if p.Salary != nil {
		setClauses = append(setClauses, "salary = $"+strconv.Itoa(argN))
		args = append(args, *p.Salary)
		argN++
	}
	if p.Location != nil {
		setClauses = append(setClauses, "location = $"+strconv.Itoa(argN))
		args = append(args, *p.Location)
		argN++
	}
	if p.ContactName != nil {
		setClauses = append(setClauses, "contact_name = $"+strconv.Itoa(argN))
		args = append(args, *p.ContactName)
		argN++
	}
	if p.ContactEmail != nil {
		setClauses = append(setClauses, "contact_email = $"+strconv.Itoa(argN))
		args = append(args, *p.ContactEmail)
		argN++
	}
	if p.Notes != nil {
		setClauses = append(setClauses, "notes = $"+strconv.Itoa(argN))
		args = append(args, *p.Notes)
		argN++
	}
	if p.NextStep != nil {
		setClauses = append(setClauses, "next_step = $"+strconv.Itoa(argN))
		args = append(args, *p.NextStep)
		argN++
	}
	if p.NextStepDate != nil {
		if *p.NextStepDate == "" {
			setClauses = append(setClauses, "next_step_date = NULL")
		} else if t, err := time.Parse("2006-01-02", *p.NextStepDate); err == nil {
			setClauses = append(setClauses, "next_step_date = $"+strconv.Itoa(argN))
			args = append(args, t)
			argN++
		}
	}

	query := fmt.Sprintf("UPDATE applications SET %s WHERE id = $1", strings.Join(setClauses, ", "))
	res, err := db.Exec(ctx, query, args...)
	if err != nil {
		rlog.Error("failed updating application", "id", id, "err", err)
		return nil, err
	}
	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		return nil, fmt.Errorf("application not found with id %d", id)
	}

	return GetApplication(ctx, id)
}

// DeleteApplication removes an application from the pipeline.
//
//encore:api public method=DELETE path=/applications/:id
func DeleteApplication(ctx context.Context, id int64) error {
	_, err := db.Exec(ctx, `DELETE FROM applications WHERE id = $1`, id)
	return err
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanApplication(s rowScanner) (*Application, error) {
	var app Application
	var leadID sql.NullInt64
	var appliedDate, nextStepDate sql.NullTime

	err := s.Scan(
		&app.ID,
		&leadID,
		&app.Company,
		&app.Role,
		&app.JobURL,
		&app.Source,
		&app.Status,
		&appliedDate,
		&app.Salary,
		&app.Location,
		&app.ContactName,
		&app.ContactEmail,
		&app.Notes,
		&app.NextStep,
		&nextStepDate,
		&app.CreatedAt,
		&app.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if leadID.Valid {
		v := leadID.Int64
		app.LeadID = &v
	}
	if appliedDate.Valid {
		v := appliedDate.Time.Format("2006-01-02")
		app.AppliedDate = &v
	}
	if nextStepDate.Valid {
		v := nextStepDate.Time.Format("2006-01-02")
		app.NextStepDate = &v
	}

	return &app, nil
}
